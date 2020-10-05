const mysql = require("mysql");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const _ = require('lodash');


const db = mysql.createConnection({
    //use ip adress for host when server is used
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});


// New user registration
// Name, email, and password are required. Phone is optional
// Upon sucessful registration, a verification email is sent to the user
exports.register = (req, res) => {
    //getting fields from json form object
    const { name, email, phone, password, passwordConfirm } = req.body;

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

        
        insertPhone = {name: name, email: email, phone: phone, pass_hash: hashedPassword, verification: 'none'};
        insertNoPhone = {name: name, email: email, pass_hash: hashedPassword, verification: 'none'}

        db.query('INSERT INTO user SET ?', !phone ? insertNoPhone : insertPhone, (error, results) => {
            if(error) {
                console.log(error);
            } else {
                const token = jwt.sign({ name, email, password }, process.env.JWT_SECRET , {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });
                
                var transporter = nodemailer.createTransport({
                    host: 'smtp.gmail.com',
                    port: 465,
                    secure: true,
                    service: 'gmail',
                    auth: {
                      user: 'noreply.petpatrol',
                      pass: 'pet!Patrol17'
                    }
                  });
                  
                  var link = process.env.SITE_URL
                  var mailOptions = {
                    from: process.env.EMAIL,
                    to: email,
                    subject: "Verify Email",
                    html: `
                        <h2> Please click the link below to activate your account.</h2>
                        <a href="${link}/auth/activate/${token}">Click here!</a>
                        `
                  };
                  
                  transporter.sendMail(mailOptions, function(error, info){
                    if (error) {
                      console.log(error);
                    } else {
                      console.log('Email sent: ' + info.response);
                    }
                  });
                return res.render('register', {
                    message: 'User sucessfully registered, please check your email to finish the verification process.'
                })
            }
        })

    });   
}

// Login Function
exports.login = async (req, res) => {
    try {
       const {email, password} = req.body;

       if( !email || !password ) {
           return res.status(400).render('login', {
               message: 'Please provide and email and password.'
           });
       } 

       
       db.query('SELECT * FROM user WHERE email = ?', [email], async (error, results) => {
           if( !results || !(await bcrypt.compare( password, results[0].pass_hash) ) ) {
            return res.status(400).render('login', {
                message: 'Email or password is incorrect.'
            });
           } else if (results[0].verification === 'none') {
                return res.status(400).render('login', {
                    message: 'Email is not verified. Please check your email for a link to verify it.'
                });
            } else {
            const id = results[0].user_id;
 
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
                res.status(200).redirect('/');
            } 
       })
        
    } catch (error) {
        console.log(error);
    }
}

// exports.activateAccount = (req, res) => {
//     const {token} = req.body;
//     if(token) {
//         jwt.verify(token, process.env.JWT_SECRET, function(error, decodedToken) {
//             if(error) {
//                 return res.status(400).json({ error: 'incorrect or expired link.'})
//             }
//             const {name, email, password} = decodedToken
//             db.query('UPDATE user SET verification = "email" WHERE email = ?', [email], async (error, results) => {
//                 if(error) {
//                     console.log(error);
//                 } else {
//                     return res.status(200).render('login', {
//                         message: 'You may now log in to your account.'
//                     });
//                 }
//             })

//         })
//     } else {
//         return res.json({error: "something went wrong"})
//     }
// }