const mysql = require("mysql");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const _ = require('lodash');
const Handlebars = require('hbs');
const { result } = require("lodash");
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const soda = require('soda-js');
const session = require('express-session');


const db = mysql.createConnection({
    //use ip adress for host when server is used
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});



// ------------ ACCOUNT CREATION/INFO VERIFICATION ------------ 


//User provides an email to send a verification link to
//A row is made for the user in the EmailVerification table
//Row contains an id, email, token, request type (0=new user, 1=reset password, 2=reverify), and the date created
exports.requestAccount = (req, res) => {
    const {email} = req.body;
    //Check email account is not already in user
    db.query('SELECT email FROM user WHERE email = ?', [email], async (error, results) => {
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
        db.query('INSERT INTO emailVerification SET ?', {email: email, token: token, requestType: 0}, (error, results) => {
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
    db.query('SELECT email FROM user WHERE email = ?', [email], async (error, results) => {
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
        db.query('INSERT INTO user SET ?', !phone ? insertNoPhone : insertPhone, (error, results) => {
            if(error) {
                console.log(error);
            } else if(phone) {
                //create token
                const token = jwt.sign({ phone }, process.env.JWT_SECRET , {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });
                //new recorn in phoneVerification table with phone, token, request type (0=phone verification)
                db.query('INSERT INTO phoneVerification SET ?', {phone: phone, token: token, requestType: 0}, (error, results) => {
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
            db.query('DELETE FROM emailVerification WHERE email = ?', [email], (error, results) => {
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
    db.query('SELECT * FROM phoneVerification WHERE token = ?', [token], (error, results) => {
        if(error) {
            console.log(error);
        } else {
            //Select users verification status to both
            db.query("UPDATE user SET verification = 'both' WHERE phone = ?", [results[0].phone], (error, results) => {
                if(error) {
                    console.log(error);
                } else {
                    //delete user from phoneVerification
                    db.query('DELETE FROM phoneVerification WHERE token = ?', [token], (error, results) => {
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
       db.query('SELECT * FROM user WHERE email = ?', [email], async (error, results) => {
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
                db.query('UPDATE user SET lastLogin = CURRENT_TIMESTAMP WHERE user_id = ?', [id], (error, results) => {
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
    db.query('SELECT * FROM user',  function (error, results) {
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
    db.query('DELETE FROM user WHERE user_id = ?', [id], (error, results) => {
        if(error) {
            console.log(error)
        } else {
            res.redirect('/adminHome');
        }
    })
    
}


// ------------ ADMIN PAGE FUNCTIONS ------------


//grant admin permissions for user
exports.makeAdmin = (req, res) => {
    var id = req.body.user_id;
    //update user info and make isAdmin = 1 to represent 'true'
    db.query('UPDATE user SET isAdmin = 1 WHERE user_id = ?', [id], (error, results) => {
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
    db.query('UPDATE user SET isAdmin = 0 WHERE user_id = ?', [id], (error, results) => {
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
    db.query('SELECT * FROM user WHERE user_id = ?', [id], (error, results) => {
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


    // Age query expressions
    if(formAge === "0 to 11 months") {
        var age = "age like '%weeks' or age like '%month%' or age like 'NULL'";
    } else if (formAge === "1 year to 4 years") {
        var age = "age like '1 year' or age like '2 years' or age like '3 years' or age like '4 years' or age like 'NULL'";
    } else if (formAge === "5 years to 9 years") {
        var age = "age like '5 year' or age like '6 years' or age like '7 years' or age like '8 years' or age like '9 years' or age like 'NULL'";
    } else if (formAge === "10+ years") {
        var age = "age like '1% years' or age like 'NULL'";
    } else if (formAge === "Choose...") {
        var age = "age like '%'";
    }

    // Sex query expressions
    if(formSex === "Intact Female") {
        var sex = "sex like 'Intact Female'";
    } else if(formSex === "Spayed Female") {
        var sex = "sex like 'Spayed Female'";
    } else if(formSex === "Intact Male") {
        var sex = "sex like 'Intact Male'";
    } else if(formSex === "Neutered Male") {
        var sex = "sex like 'Neutered Male'";
    } else if(formSex === "Unknown" || formSex === "Choose...") {
        var sex = "sex like '%'";
    }
    
    // Type query expressions
    if(formType === "Dog") {
        var type = "type like 'Dog'";
    } else if(formType === "Cat") {
        var type = "type like 'Cat'";
    } else if(formType === "Other") {
        var type = "type like 'Other'";
    } else if(formType === "Choose...") {
        var type = "type like '%'";
    }


    // Color query expressions
    if(!Array.isArray(formColor)){
        if (typeof formColor === 'undefined') {
            var color = "color like '%'";
        } else {
            var color = `color like '%${formColor}%'`;
        }
    } else {
        var i;
        var color = "";
        for (i = 0; i < formColor.length; i++) {
            if (i === 0) {
                var str = `color like '%${formColor[i]}%'`;
                var color = color.concat(str);
            } else {
                var str = ` or color like '%${formColor[i]}%'`;
                var color = color.concat(str);
            }
        }
    }

    // Breed query expressions
    if(!Array.isArray(formBreed)){
        if (typeof formBreed === 'undefined') {
            var looks_like = "looks_like like '%'";
        } else {
            var looks_like = `looks_like like '%${formBreed}%'`;
        }
    } else {
        var i;
        var looks_like = "";
        for (i = 0; i < formBreed.length; i++) {
            if (i === 0) {
                var str = `looks_like like '%${formBreed[i]}%'`;
                var looks_like = looks_like.concat(str);
            } else {
                var str = ` or looks_like like '%${formBreed[i]}%'`;
                var looks_like = looks_like.concat(str);
            }
        }
    }

    //put search expressions into array
    var search = [age, sex, type, color, looks_like];

    var consumer = new soda.Consumer('data.austintexas.gov');

    //query soda api
    consumer.query()
        .withDataset('hye6-gvq2')
        //Currently just getting pit bulls for testing purposes
        .where(age, sex, type, color, looks_like)
        .getRows()
        .on('success', (rows) => {
            if (rows.length === 0) {
                return res.render('results', {
                    message: "No pets were found matching the description provided. Try widening the search criteria for color(s) and or breed(s) to get more results."
                }) 
            } else {
                return res.render('results', {
                    pets: rows, user: req.session.userName, isAdmin: req.session.permissions, results: rows.length, search: search
                })
            }
        
        })
        .on('error', (error) => {
            return res.render('results', {
                message: "No pets were found matching the description provided. Try widening the search criteria for color(s) and or breed(s) to get more results."
            })
        })
}



// ------------ SEARCH DATA FUNCTIONS ------------ 

