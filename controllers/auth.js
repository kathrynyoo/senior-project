const mysql = require("mysql");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv').config();
const _ = require('lodash');
const Handlebars = require('hbs');
const { result } = require("lodash");
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const soda = require('soda-js');
const session = require('express-session');
var async = require("async");
const util = require("util");
const axios = require("axios");
const { activitiesUrl } = require("twilio/lib/jwt/taskrouter/util");


const getPets = async function(searchCriteria) {
    try {
        const response = await axios.get(searchCriteria);
        return await response.data;
    } catch (err) {
        console.log(err);
    }
}

function sendText(phone, body) {
    console.log(`sending text to ${phone}`)
    //make entered phone number into E.164 format
    var phoneArray = phone.split("-");
    var formattedPhone = "+1".concat(phoneArray[0]).concat(phoneArray[1]).concat(phoneArray[2]);
    //send text notification
    client.messages
        .create({
            body: body,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedPhone
            })
            .then(message => console.log(`sent text${message.sid}`));
}

function sendEmail(email, subject, message){
    console.log(`sending email to ${email}`)
    //send email notification
    var transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        service: 'gmail',
        auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
        }
    });
                                
    var link = process.env.SITE_URL
    var mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: subject,
        html: message
    };
                                
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
        console.log(error);
        } else {
        console.log('Email sent: ' + info.response);
        }
    });
}

function newMatchNotify(user, searchName, notificationType){
    console.log(`new matches found`)
    // get user phone and email for current search
    pool.query("SELECT email,phone FROM user WHERE user_id = ?", [user], (error, results) => {

        if(error) {
            console.log(error)
        } else {
            console.log(`Notifications for user #${user}:`)
            var phone = results[0].phone;
            var email = results[0].email;

            var link = process.env.SITE_URL
            var textBody = `A new pet matching your search called ${searchName} has been added to the Austin Animal Center database! Log in to your account to view the new result(s)! ${link}`

            var emailSubject = "New matches found!"
            var emailMessage = `
                <h2>A new pet matching your search called ${searchName} has been added to the Austin Animal Center database! <a href="${link}/login">Log in</a> to your account to view the new result(s)!</h2>
                `

            if (notificationType == "both" && phone !== null) {
                sendText(phone, textBody)
                sendEmail(email, emailSubject, emailMessage)
            } else if (notificationType == "email") {
                sendEmail(email, emailSubject, emailMessage)
            } else if (notificationType == "phone" && phone !== null) {
                sendText(phone, textBody)
            }
        }
    })
}

const pool = mysql.createPool({
    connectionLimit: 10,
    //use ip adress for host when server is used
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});

pool.query = util.promisify(pool.query)

// ------------ ACCOUNT CREATION/INFO VERIFICATION ------------ 


//User provides an email to send a verification link to
//A row is made for the user in the EmailVerification table
//Row contains an id, email, token, request type (0=new user, 1=reset password, 2=reverify), and the date created
exports.requestAccount = (req, res) => {
    const {email} = req.body;
    //Check email account is not already in user
    pool.query('SELECT email FROM user WHERE email = ?', [email], async (error, results) => {
        if(error) {
            console.log(error);
        }
        else if( results.length > 0) {
            return res.render('requestAccount', {
                message: 'Email is already in use'
            });
        }
        //create token
        const token = jwt.sign({ email}, process.env.JWT_SECRET , {
            expiresIn: process.env.JWT_EXPIRES_IN
        });

        //inserting new row for into emailVarification table
        pool.query('INSERT INTO emailVerification SET ?', {email: email, token: token, requestType: 0}, (error, results) => {
            if(error) {
                console.log(error);
            } else {
                //sending the registartion email
                var transporter = nodemailer.createTransport({
                    host: 'smtp.gmail.com',
                    port: 465,
                    secure: true,
                    service: 'gmail',
                    auth: {
                      user: process.env.EMAIL,
                      pass: process.env.EMAIL_PASSWORD
                    }
                  });
                  
                  var link = process.env.SITE_URL
                  var mailOptions = {
                    from: process.env.EMAIL,
                    to: email,
                    subject: "Verify Email",
                    html: `
                        <h2> Please click the link below to finish the registration process for your account.</h2>
                        <a href="${link}/register?token=${token}">Click here!</a>
                        `
                  };
                  
                  transporter.sendMail(mailOptions, function(error, info){
                    if (error) {
                      console.log(error);
                    } else {
                      console.log('Email sent: ' + info.response);
                    }
                  });
                return res.render('requestAccount', {
                    message: 'Please check your email for a link to complete the registration process.'
                });
            }
        })
    })    
}

// New user registration
// Name, email, and password are required. Phone is optional
// Upon sucessful registration, the users corresponding row in EmailVerification table is deleted
exports.register = (req, res) => {
    //getting fields from json form object
    const { name, email, phone, password, passwordConfirm } = req.body;

    //check that user with that email doesnt already exist
    //and check that password fields match
    pool.query('SELECT email FROM user WHERE email = ?', [email], async (error, results) => {
        if(error) {
            console.log(error);
        }
        if( results.length > 0) {
            return res.render('register', {
                message: 'Email is already in use'
            });
        } else if( password !== passwordConfirm) {
            return res.render('register', {
                message: 'Passwords do not match'
            });
        } 

        //hash password w/ 8 rounds of encryption
        let hashedPassword = await bcrypt.hash(password, 8);

        //Check if the user entered a phone number
        insertPhone = {name: name, email: email, phone: phone, pass_hash: hashedPassword, verification: 'email'};
        insertNoPhone = {name: name, email: email, pass_hash: hashedPassword, verification: 'email'}

        //insert new user into user table
        pool.query('INSERT INTO user SET ?', !phone ? insertNoPhone : insertPhone, (error, results) => {
            if(error) {
                console.log(error);
            } else if(phone) {
                //create token
                const token = jwt.sign({ phone }, process.env.JWT_SECRET , {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });
                //new recorn in phoneVerification table with phone, token, request type (0=phone verification)
                pool.query('INSERT INTO phoneVerification SET ?', {phone: phone, token: token, requestType: 0}, (error, results) => {
                    if(error) {
                        console.log(error);
                    } else { 
                        //make entered phone number into E.164 format
                        var phoneArray = phone.split("-");
                        var formattedPhone = "+1".concat(phoneArray[0]).concat(phoneArray[1]).concat(phoneArray[2]);
                        var link = process.env.SITE_URL
                        //send text
                        client.messages
                            .create({
                                body: 'Click this link and log in to verify your phone number. '+link+'/phoneVerify?token='+token,
                                from: process.env.TWILIO_PHONE_NUMBER,
                                to: formattedPhone
                                })
                                .then(message => console.log(message.sid));
                    }
                
            })}
            //delete record from emailVerification table and redirect to login page
            pool.query('DELETE FROM emailVerification WHERE email = ?', [email], (error, results) => {
                if(error) {
                    console.log(error)
                } else {
                    res.status(200).redirect('/login');
                }
            })
        })

    });   
}

// User enters phone number on registration or info update page
// A text is sent to the number provided with a verification link
exports.verifyPhone = (req, res) => {
    //get token from url params
    var token = req.query.token;

    //Select user from phoneVerification with matching token
    pool.query('SELECT * FROM phoneVerification WHERE token = ?', [token], (error, results) => {
        if(error) {
            console.log(error);
        } else {
            //Select users verification status to both
            pool.query("UPDATE user SET verification = 'both' WHERE phone = ?", [results[0].phone], (error, results) => {
                if(error) {
                    console.log(error);
                } else {
                    //delete user from phoneVerification
                    pool.query('DELETE FROM phoneVerification WHERE token = ?', [token], (error, results) => {
                        if(error) {
                            console.log(error);
                        } else {
                            //redirect to the home page
                            return res.status(200).redirect('/');
                        }
                    })
                }
            })
        }
    })

}


// ------------ LOGIN AND LOGOUT ------------ 


// Login Function
exports.login = async (req, res) => {
    try {
       const {email, password} = req.body;

       //check that email and password were both entered
       if( !email || !password ) {
           return res.status(400).render('login', {
               message: 'Please provide an email and password.'
           });
       } 

       //check email and password are valid
       pool.query('SELECT * FROM user WHERE email = ?', [email], async (error, results) => {
           if( !results || !(await bcrypt.compare( password, results[0].pass_hash) ) ) {
            return res.status(400).render('login', {
                message: 'Email or password is incorrect.'
            });
           } else if (results.length === 0) {
                return res.status(400).render('login', {
                    message: 'Email or password is incorrect.'
                });
            } else {
                //get variables to be used as session vars from the query results
                const userName = results[0].name;
                const userEmail = results[0]. email
                const id = results[0].user_id;
                const permissions = results[0].isAdmin === 0 ? false : true;
                
                //Update user with new lastlogin date
                pool.query('UPDATE user SET lastLogin = CURRENT_TIMESTAMP WHERE user_id = ?', [id], (error, results) => {
                    if(error) {
                        console.log(error);
                    } else {
                        sessionData = req.session;

                        // token and cookie stuff
                        const token = jwt.sign({ id: id }, process.env.JWT_SECRET , {
                            expiresIn: process.env.JWT_EXPIRES_IN
                        });
        
                        const cookieOptions = {
                            expires: new Date(
                                Date.now() + process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000
                            ),
                            httpOnly: true
                        }

                        //set up cookie 
                        res.cookie('jwt', token, cookieOptions);

                        //session vars
                        sessionData.userName = userName;
                        sessionData.email = userEmail;
                        sessionData.user_id = id;
                        sessionData.permissions = permissions;

                        res.redirect('/');
                    }
                })
    
            } 
        })
            
        } catch (error) {
            console.log(error);
        }
}


//logout
exports.logout = (req, res) => {
    req.session.destroy(function(err) {
        if(err) {
          console.log(err);
        } else {
            res.status(200).redirect('/');
        }
      });
}


// ------------ USER DATA FUNCTIONS (LISTALL, DELETE, ETC.) ------------ 


//list all users in table
exports.listUsers = (req, res) => {
    pool.query('SELECT * FROM user',  function (error, results) {
        if(error) {
            console.log(error)
        }
        else if(!results) {
            return res.render('adminHome', {
                message: 'There are no users registered in the database.', users: results, user: req.session.userName, isAdmin: req.session.permissions
            });
        }
        else {
            //Handlebars helper to set isAdmin to true or false booleans
            Handlebars.registerHelper('isAdmin', function (aStr) {
                if (aStr !== 0) {
                    return true
                }
                else {
                    return false
                }
            });
            //Handlebars helper to check if 5 years has passed since a users last login
            Handlebars.registerHelper('isExpired', function (date1) {
                var dateNow = new Date();
                var differenceInTime = dateNow.getTime() - date1.getTime();
                var differenceInDays = differenceInTime / (1000 *3600 *24);
                //check if difference in days is >= to 5 years (1825 days)
                if(differenceInDays >= 1825) {
                    return true
                } else {
                    return false
                }
            })
            return res.render('adminHome', {
                users: results, user: req.session.userName, isAdmin: req.session.permissions
            });
        } 
    });
}

// delete user from database
exports.deleteUser = (req, res) => {
    var id = req.body.user_id;
    pool.query('DELETE FROM petSearch WHERE user_id = ?', [id], (error, results) => {
        if(error) {
            console.log(error)
        } else {
            pool.query(`DELETE FROM previousMatches WHERE user_id = ?`, [id], (error, results) => {
                if(error) {
                    console.log(error);
                } else {
                    pool.query('DELETE FROM user WHERE user_id = ?', [id], (error, results) => {
                        if(error) {
                            console.log(error)
                        } else {
                            res.redirect('/adminHome');
                        }
                    })
                }
            })    
        }
    })   
}


// ------------ ADMIN PAGE FUNCTIONS ------------


//grant admin permissions for user
exports.makeAdmin = (req, res) => {
    var id = req.body.user_id;
    //update user info and make isAdmin = 1 to represent 'true'
    pool.query('UPDATE user SET isAdmin = 1 WHERE user_id = ?', [id], (error, results) => {
        if(error) {
            console.log(error)
        } else {
            res.redirect('/adminHome');
        }
    })
}

//remove users admin permissions
exports.removeAdmin = (req, res) => {
    var id = req.body.user_id;
    //update user info and make isAdmin = 0 to represent 'flase'
    pool.query('UPDATE user SET isAdmin = 0 WHERE user_id = ?', [id], (error, results) => {
        if(error) {
            console.log(error)
        } else {
            res.redirect('/adminHome');
        }
    })
}

//send reverification email and/or text to user
exports.reverify = (req, res) => {
    var id = req.body.user_id;
    //get user info from database
    pool.query('SELECT * FROM user WHERE user_id = ?', [id], (error, results) => {
        if(error) {
            console.log(error)
        } else if (results[0].phone) {
            var phone = results[0].phone;
            var email = results[0].email;

            //make entered phone number into E.164 format
            var phoneArray = phone.split("-");
            var formattedPhone = "+1".concat(phoneArray[0]).concat(phoneArray[1]).concat(phoneArray[2]);
            var link = process.env.SITE_URL
            //send text notification
            client.messages
                .create({
                    body: 'Your PetPatrol account is about to expire! Please login at the link provided if you want your account to remain activated. '+link+'/login',
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: formattedPhone
                    })
                    .then(message => console.log(message.sid));

            //send email notification
            var transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                service: 'gmail',
                auth: {
                  user: process.env.EMAIL,
                  pass: process.env.EMAIL_PASSWORD
                }
              });
              
              var link = process.env.SITE_URL
              var mailOptions = {
                from: process.env.EMAIL,
                to: email,
                subject: "Your PetPatrol account is about to expire!",
                html: `
                    <h2>Your PetPatrol account is about to expire! Please login at the link provided if you want your account to remain activated.</h2>
                    <a href="${link}/login">Click here!</a>
                    `
              };
              
              transporter.sendMail(mailOptions, function(error, info){
                if (error) {
                  console.log(error);
                } else {
                  console.log('Email sent: ' + info.response);
                }
              });

              res.redirect('/adminHome')
        } else {
            var email = results[0].email;

            //send email notification
            var transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                service: 'gmail',
                auth: {
                  user: process.env.EMAIL,
                  pass: process.env.EMAIL_PASSWORD
                }
              });
              
              var link = process.env.SITE_URL
              var mailOptions = {
                from: process.env.EMAIL,
                to: email,
                subject: "Your PetPatrol account is about to expire!",
                html: `
                    <h2>Your PetPatrol account is about to expire! Please login at the link provided if you want your account to remain activated.</h2>
                    <a href="${link}/login">Click here!</a>
                    `
              };
              
              transporter.sendMail(mailOptions, function(error, info){
                if (error) {
                  console.log(error);
                } else {
                  console.log('Email sent: ' + info.response);
                }
              });

              res.redirect('/adminHome')

        }
    })
}




// ------------ PET DATA FUNCTIONS ------------ 


//get all pets from aac database
exports.listAllPets = (req, res) => {
    
    var consumer = new soda.Consumer('data.austintexas.gov');

    //query ACC SODA api to get allPets
    consumer.query().withDataset('hye6-gvq2').getRows()
        .on('success', (rows) => {
        return res.render('allPets', {
            pets: rows, user: req.session.userName, isAdmin: req.session.permissions
        })
        })
        .on('error', (error) => {
            console.log(error)
        })
}

//search the pets in aac database based on criteria posted from search form
exports.searchPets = (req, res) => {
    //getting posted variable
    var formSex = req.body.sex;
    var formColor = req.body.color;
    var formType = req.body.type;
    var formBreed = req.body.breed;
    var formAge = req.body.age;


    //make 'clean' search criteria string
    var cleanSearch = `${formSex}*${formType}*${formAge}*`

    // Age query expressions
    if(formAge == "0 to 11 months") {
        var age = "(age like '%25weeks' or age like '%25months')";
    } else if (formAge == "1 year to 4 years") {
        var age = "(age = '1 year' or age = '2 years' or age = '3 years' or age = '4 years')";
    } else if (formAge == "5 years to 9 years") {
        var age = "(age like '5 year' or age like '6 years' or age like '7 years' or age like '8 years' or age like '9 years')";
    } else if (formAge == "10+ years") {
        var age = "age like '1% years'";
    } else if (formAge == "Choose...") {
        var age = "age like '%25'";
    }

    // Sex query expressions
    if(formSex == "Intact Female") {
        var sex = "sex = 'Intact Female'";
    } else if(formSex == "Spayed Female") {
        var sex = "sex = 'Spayed Female'";
    } else if(formSex == "Intact Male") {
        var sex = "sex = 'Intact Male'";
    } else if(formSex == "Neutered Male") {
        var sex = "sex = 'Neutered Male'";
    } else if(formSex == "Unknown" || formSex == "Choose...") {
        var sex = "sex like '%25'";
    }
    
    // Type query expressions
    if(formType == "Dog") {
        var type = "type = 'Dog'";
    } else if(formType == "Cat") {
        var type = "type = 'Cat'";
    } else if(formType == "Other") {
        var type = "type = 'Other'";
    } else if(formType == "Choose...") {
        var type = "type like '%25'";
    }


    // Color query expressions
    if(!Array.isArray(formColor)){
        if (typeof formColor == 'undefined') {
            var color = "color like '%25'";
            cleanSearch = cleanSearch.concat('not specified*')
        } else {
            var color = `color like '%25${formColor}%25'`;
            cleanSearch = cleanSearch.concat(`${formColor}*`)
        }
    } else {
        var i;
        var color = "";
        for (i = 0; i < formColor.length; i++) {
            if (i === 0) {
                var str = `(color like '%25${formColor[i]}%25'`;
                var color = color.concat(str);
                cleanSearch = cleanSearch.concat(`${formColor[i]}`)
            } else {
                var str = ` or color like '%25${formColor[i]}%25'`;
                var color = color.concat(str);
                cleanSearch = cleanSearch.concat(`@${formColor[i]}`)
            }
        }
        var color = color.concat(`)`)
    }

    // Breed query expressions
    if(!Array.isArray(formBreed)){
        if (typeof formBreed == 'undefined') {
            var looks_like = "looks_like like '%25'";
            cleanSearch = cleanSearch.concat('*not specified')
        } else {
            var looks_like = `looks_like like '%25${formBreed}%25'`;
            cleanSearch = cleanSearch.concat(`*${formBreed}`)
        }
    } else {
        var i;
        var looks_like = "";
        for (i = 0; i < formBreed.length; i++) {
            if (i === 0) {
                var str = `(looks_like like '%25${formBreed[i]}%25'`;
                var looks_like = looks_like.concat(str);
                cleanSearch = cleanSearch.concat(`*${formBreed[i]}`)
            } else {
                var str = ` or looks_like like '%25${formBreed[i]}%25'`;
                var looks_like = looks_like.concat(str);
                cleanSearch = cleanSearch.concat(`@${formBreed[i]}`)
            }
        }
        var looks_like = looks_like.concat(`)`)
    }
    
    //put search expressions into string for querying SODA API
    var query_str = `https://data.austintexas.gov/resource/hye6-gvq2.json?$where=${type} AND ${color} AND ${age} AND ${looks_like} AND ${sex}`

    console.log(query_str);

    axios.get(query_str)
        .then(function (response) {
            if (response.data.length === 0) {
                req.session.search = query_str;
                req.session.clean_search = cleanSearch;

                return res.render('results', {
                    message: "No pets were found matching the description provided. Try widening the search criteria for color(s) and or breed(s) to get more results.", userID: req.session.userID, user: req.session.userName, isAdmin: req.session.permissions, results: response.data.length, cleanSearch: req.session.clean_search, search: req.session.search
                }) 
            } else {
                req.session.search = query_str;
                req.session.clean_search = cleanSearch;
                var result_ids = [];
                result_ids.length = response.data.length;
                
                count = 0;
                while(count < response.data.length) {
                    result_ids[count] = response.data[count].animal_id;
                    count += 1
                }
                req.session.result_ids = result_ids;
        
                return res.render('results', {
                    pets: response.data, userID: req.session.userID, user: req.session.userName, isAdmin: req.session.permissions, results: response.data.length, search: req.session.search, cleanSearch: req.session.clean_search, resultIds: req.session.result_ids
                })
            }
        })
        .catch(function (error) {
            return res.render('results', {
                message: "No pets were found matching the description provided. Try widening the search criteria for color(s) and or breed(s) to get more results.", userID: req.session.userID, user: req.session.userName, isAdmin: req.session.permissions
            })
        })
}



// ------------ SEARCH DATA FUNCTIONS ------------ 

//user saves a search name, query, and notification preferences
exports.saveSearch = (req, res) => {
    //get data from save search form 
    var searchName = req.body.search_name;
    var searchString = req.session.search;
    var cleanSearch = req.session.clean_search;
    var notificationPreferenceForm = req.body.notifications;
    var userID = req.session.user_id;
    var petIds = req.session.result_ids

    
    var notificationPreference;

    if(notificationPreferenceForm == 'Email'){
        notificationPreference = 'email';
    } else if(notificationPreferenceForm == 'Text'){
        notificationPreference = 'phone';
    } else if(notificationPreferenceForm == 'Email and text'){
        notificationPreference = 'both';
    } else if(notificationPreferenceForm == 'No notifications'){
        notificationPreference = 'none';
    }

    var searchId;

    //save new search info to database
    pool.query("INSERT INTO petSearch SET ?", {user_id: userID, search_name: searchName, search_query: searchString, notification_type: notificationPreference, clean_search: cleanSearch}, async (error, results) => {
        if(error) {
            console.log(error);
        } else {
            console.log('search inserted into petSearch')
            console.log('trying to select search_id...')
            
            for(var pet in petIds) {
                pool.query('INSERT INTO previousMatches SET ?', {user_id: userID, pet_id: petIds[pet], search_name: searchName}, (error, results) => {
                    if (error) {
                        console.log(error);
                    } 
                })
            }
            console.log('success adding to previousMatches');
            return res.render('results', {
                saveSuccess: "Search saved successfully! Check the 'My Saved Searches' tab to view and edit your saved searches!", user: req.session.userName, isAdmin: req.session.permissions, dontShowSaveButton: true
            });

        } 
    });

}

//list all saved searches
exports.listSavedSearches = (req, res) => {
    var userID = req.session.user_id;

    console.log(`userID ${userID}`);

    //select all saved searches for user
    pool.query('SELECT * FROM petSearch WHERE user_id = ?', [userID], (error, results) => {
        if(error) {
            console.log(error)
        }
        else if(!results) {
            return res.render('savedSearches', {
                message: 'No searches have been saved yet!', user: req.session.userName, isAdmin: req.session.permissions
            });
        }
        else {
            Handlebars.registerHelper('notificationsOn', function (aStr) {
                if (aStr !== "none") {
                    return true
                }
                else {
                    return false
                }
            });

            //format data into a dictionary with searchId, sex, type, age, color(s), breed(s)
            var cleanSearchArr = []
            var count = 0;
            while(count < results.length) {
                var chunks = results[count].clean_search.split("*");
                
                if(chunks[0] == "Choose..."){
                    chunks[0] = "Not specified"
                } if(chunks[1] == "Choose..."){
                    chunks[1] = "Not specified"
                } if(chunks[2] == "Choose..."){
                    chunks[2] = "Not specified"
                }
                if(chunks[3].includes("@")) {
                    var colors = chunks[3].split('@');
                } else {
                    var colors = chunks[3];
                }
                if(chunks[4].includes("@")) {
                    var breeds = chunks[4].split('@');
                } else {
                    var breeds = chunks[chunks.length-1];
                }
                var cleanSearchDict = {notificationType: results[count].notification_type, searchId: results[count].search_id, searchName: results[count].search_name, sex: chunks[0], type: chunks[1], age: chunks[2], color: colors, breed: breeds}
                
                cleanSearchArr.push(cleanSearchDict);
                count = count + 1
            }
        
            return res.render('savedSearches', {
                savedSearches: results, user: req.session.userName, isAdmin: req.session.permissions, searchCriteria: cleanSearchArr
            }); 
        } 
    });
}


//user deletes a specific search
exports.deleteSearch = (req, res) => {
    searchName = req.body.searchName;
    userId = req.session.user_id;
    searchId = req.body.searchId;
    

    pool.query('DELETE FROM petSearch WHERE search_id = ?', [searchId], (error, results) => {
        if(error) {
            console.log(error)
        } else {
            pool.query(`DELETE FROM previousMatches WHERE search_name = '${searchName}' AND user_id = ?`, [userId], (error, results) => {
                if(error) {
                    console.log(error);
                } else {
                    console.log('success deleting from previousMatches');
                    res.redirect('/savedSearches');
                }
            })    
        }
    })

}


//turn off notifications for a specific search
exports.stopNotifications = (req, res) => {
    searchId = req.body.searchId;

    pool.query("UPDATE petSearch SET notification_type = 'none' WHERE search_id = ?", [searchId], (error, results) => { 
        if(error) {
            console.log(error)
        } else {
            res.redirect('/savedSearches');
        }

    })
}

// view current results for a search
exports.currentMatches = (req, res) => {
    searchId = req.body.searchId;
    searchName = req.body.searchName;

    pool.query("SELECT * FROM petSearch WHERE search_id = ?", [searchId], async (error, results) => {
        if(error) {
            console.log(error)
        } else {
            const queryString = results[0].search_query;

            const response = await getPets(queryString);

            return res.render('results', {
                pets: response, userID: req.session.userID, user: req.session.userName, isAdmin: req.session.permissions, results: response.length, isSaved: true, searchName: searchName, dontShowSaveButton: true
            })
        }
    })
    
}

// ------------ AUTOMATIC FUNCTIONS AND HELPERS ------------ 

// Automated check for database
exports.checkData = (req, res) => {

    // select all searches to recieve notifications
    pool.query("SELECT * FROM petSearch WHERE notification_type != 'none'", async (error, results) => { 
        if(error) {
            console.log(error)
        } else {
            var count;
            // iterate through each search result
            for (count = 0; count < results.length; count++) {
                // initiate vars for current search
                const searchCriteria = results[count].search_query;
                const searchName = results[count].search_name;
                const user = results[count].user_id;
                const notificationType = results[count].notification_type;
                

                console.log(`Search #${count+1}: ${searchName} by user ${user}`);

                // select all previous matches for current search
                pool.query(`SELECT pet_id FROM previousMatches WHERE user_id = ${user} AND search_name = '${searchName}'`,async (error, results) => {
                    if(error) {
                        console.log(error);
                    } else {
                        var newMatches = 0;
                        var prevSearches = [];
                        var resCount = 0;
                        // add previous searches to array 
                        while(resCount < results.length) {
                            prevSearches.push(results[resCount].pet_id);
                            resCount += 1
                        }
                        // query SODA API for current search
                        const response = await getPets(searchCriteria);

                        if(response && response.length != 0) {
                            for(const pet in response) {
                                if(prevSearches.includes(response[pet].animal_id) == false) {
                                    // Add any new matches to previous matches
                                    pool.query("INSERT INTO previousMatches SET ?", {user_id: user, pet_id: response[pet].animal_id, search_name: searchName}, (error, results) => {
                                        if(error) {
                                            console.log(error)
                                        }
                                    })
                                    newMatches += 1;
                                }
                            }
                            // if there are new matches
                            if(newMatches > 0) {
                                newMatchNotify(user, searchName, notificationType);
                            }

                        }
                    }                    
                })
            }
        }
    })
}




