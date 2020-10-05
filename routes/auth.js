const express = require('express');
const authController = require('../controllers/auth')

const router = express.Router();

//registration form submition 
router.post('/register', authController.register)

//login form submission
router.post('/login', authController.login)

//router.post('/email-activate', authController.activateAccount)
module.exports = router;