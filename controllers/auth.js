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
        console.log(hashedPassword);

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
            const userName = results[0].name;
            const userEmail = results[0]. email
            const id = results[0].user_id;
            
            //Update user with new lastlogin date
            db.query('UPDATE user SET lastLogin = CURRENT_TIMESTAMP WHERE user_id = ?', [id], (error, results) => {
                if(error) {
                    console.log(error);
                }
            })
 
            ///token and cookie stuff
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
            var ssn = req.session;
            ssn.email = userEmail;
            ssn.user_id = id;
            ssn.name = userName;
            ssn.loggedIn = true;
            req.session.save();
            
            res.status(200).redirect('/')
        } 
       })
        
    } catch (error) {
        console.log(error);
    }
}


//list all users in table
exports.listUsers = (req, res) => {
    db.query('SELECT * FROM user',  function (error, results) {
        if(error) {
            console.log(error)
        }
        else if(!results) {
            return res.status(400).render('adminHome', {
                message: 'There are no users registered in the database.'
            });
        }
        else {
            return res.render('adminHome', {
                users: results
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
            res.status(200).redirect('/adminHome');
        }
    })
    
}


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


//get all pets from aac api
exports.listAllPets = (req, res) => {
    if(req.session.name) {
        console.log(req.session.name)
    }
    
    var consumer = new soda.Consumer('data.austintexas.gov');

    //query ACC SODA api to get allPets
    consumer.query().withDataset('hye6-gvq2').getRows()
        .on('success', (rows) => {
        return res.render('allPets', {
            pets: rows
        })
        })
        .on('error', (error) => {
            console.log(error)
        })
}


//logout
exports.logout = (req, res) => {
    req.session.destroy(function(err) {
        if(err) {
          console.log(err);
        } else {
            res.status(200).render('index', {
                loggedIn: false
            });
        }
      });
}
//send reverification email/text to users
// exports.reverifyUser = (req, res) => {
//     var email = req.body.email;

//     db.query('SELECT * FROM user WHERE email = ?', [email], (error, results) => {
//         if(error) {
//             console.log(error);
//         } else {
//             if(results[0].verification === 'email') {
//                 //create token
//                 const token = jwt.sign({ email}, process.env.JWT_SECRET , {
//                     expiresIn: process.env.JWT_EXPIRES_IN
//                 });

//                 //inserting new row for into emailVarification table
//                 db.query('INSERT INTO emailVerification SET ?', {email: email, token: token, requestType: 2}, (error, results) => {
//                     if(error) {
//                         console.log(error);
//                     } else {
//                         //sending the reverification email
//                         var transporter = nodemailer.createTransport({
//                             host: 'smtp.gmail.com',
//                             port: 465,
//                             secure: true,
//                             service: 'gmail',
//                             auth: {
//                             user: 'noreply.petpatrol',
//                             pass: 'pet!Patrol17'
//                             }
//                         });
                            
//                         var link = process.env.SITE_URL
//                         var mailOptions = {
//                             from: process.env.EMAIL,
//                             to: email,
//                             subject: "Reverify Email",
//                             html: `
//                                 <h2> Please click the link below and log in to reverify this email for your account.</h2>
//                                 <a href="${link}/login?token=${token}">Click here!</a>
//                             `
//                         };
                            
//                         transporter.sendMail(mailOptions, function(error, info){
//                             if (error) {
//                                 console.log(error);
//                             } else {
//                                 console.log('Email sent: ' + info.response);
//                             }
//                         });
//                         return res.render('adminHome', {
//                             message: 'Reverification email sent.'
//                         });
//                         }
//                     })
                
//             }

//         }
//     })

// }

