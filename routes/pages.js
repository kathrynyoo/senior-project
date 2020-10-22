const express = require('express');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/auth');
var session = require('express-session');
const Handlebars = require('hbs');


const router = express.Router();

//home page
router.get('/', (req, res) => {
    res.render('index')
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

//verify phone number
router.get('/phoneVerify', authController.verifyPhone);

//list all pets
router.get('/allPets', authController.listAllPets);

//logout user
router.get('/logout', authController.logout);


module.exports = router;