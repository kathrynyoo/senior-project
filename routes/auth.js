const express = require('express');
const authController = require('../controllers/auth')


const router = express.Router();

//registration form submition 
router.post('/register', authController.register)

//login form submission
router.post('/login', authController.login)

//delete a user from admin home page
router.post('/deleteUser', authController.deleteUser)

//prompt reverification from admin home page
//router.post('/reverify', authController.reverifyUser)

//request account
router.post('/requestAccount', authController.requestAccount)


module.exports = router;