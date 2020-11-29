const express = require('express');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/auth');
var session = require('express-session');
const Handlebars = require('hbs');


const router = express.Router();


//home page
router.get('/', (req, res) => {
    if(!req.session.userName) {
        res.render('index');
    } else {
        res.render('index', {
            user: req.session.userName, isAdmin: req.session.permissions
        });
    }
});

//registration page
router.get('/register', (req, res) => {
    res.render('register');
});

//login page
router.get('/login', (req, res) => {
    res.render('login');
});

//admin home page
router.get('/adminHome', authController.listUsers);

//request account page
router.get('/requestAccount', (req, res) => {
    res.render('requestAccount');
});

router.get('/auth/login', (req, res) => {
    if(!req.session.userName) {
        res.redirect('/');
    } else {
        res.redirect('/');
    }
});

//verify phone number
router.get('/phoneVerify', authController.verifyPhone);

//list all pets
router.get('/allPets', authController.listAllPets);

//search pets home page
router.get('/search', (req, res) => {
    res.render('search')
})

//about us page
router.get('/aboutUs', (req, res) => {
    res.render('aboutUs')
})

//resources page
router.get('/resources', (req, res) => {
    res.render('resources')
})

//logout user
router.get('/logout', authController.logout);



module.exports = router;