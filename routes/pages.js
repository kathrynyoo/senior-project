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
            user: req.session.userName, isAdmin: req.session.permissions, userID: req.session.user_id
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

router.get('/auth/login', (req, res) => {
    if(!req.session.userName) {
        res.redirect('/');
    } else {
        res.redirect('/');
    }
});

//admin home page
router.get('/adminHome', authController.listUsers);

//saved searches page
router.get('/savedSearches', authController.listSavedSearches);

//request account page
router.get('/requestAccount', (req, res) => {
    res.render('requestAccount');
});

//verify phone number
router.get('/phoneVerify', authController.verifyPhone);

//list all pets
router.get('/allPets', authController.listAllPets);

//search pets home page
router.get('/search', (req, res) => {
    if(!req.session.userName) {
        res.render('search');
    } else {
        res.render('search', {
            user: req.session.userName, isAdmin: req.session.permissions, userID: req.session.user_id
        });
    }
})

router.get('/auth/search', (req, res) => {
    if(!req.session.userName) {
        res.render('results');
    } else {
        res.render('results', {
            user: req.session.userName, isAdmin: req.session.permissions, userID: req.session.user_id
        });
    }
});

//results page
router.get('/results', (req, res) => {
    if(!req.session.userName) {
        res.render('results');
    } else {
        res.render('results', {
            user: req.session.userName, isAdmin: req.session.permissions, userID: req.session.user_id
        });
    }
});

router.get('/auth/saveSearch', (req, res) => {
    if(!req.session.userName) {
        res.render('results');
    } else {
        res.render('results', {
            user: req.session.userName, isAdmin: req.session.permissions, userID: req.session.user_id, search: req.session.search, cleanSearch: req.session.clean_search
        });
    }
})

//about us page
router.get('/aboutUs', (req, res) => {
    if(!req.session.userName) {
        res.render('aboutUs');
    } else {
        res.render('aboutUs', {
            user: req.session.userName, isAdmin: req.session.permissions
        });
    }
})

//resources page
router.get('/resources', (req, res) => {
    if(!req.session.userName) {
        res.render('resources');
    } else {
        res.render('resources', {
            user: req.session.userName, isAdmin: req.session.permissions
        });
    }
})

//logout user
router.get('/logout', authController.logout);



module.exports = router;