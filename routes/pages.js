const express = require('express');

const router = express.Router();

//home page
router.get('/', (req, res) => {
    res.render('index');
});

//registration page
router.get('/register', (req, res) => {
    res.render('register');
});

//login page
router.get('/login', (req, res) => {
    res.render('login');
});

module.exports = router;