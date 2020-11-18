const express = require('express');
const authController = require('../controllers/auth')


const router = express.Router();

//registration form submition 
router.post('/register', authController.register)

//login form submission
router.post('/login', authController.login)

//delete a user from admin home page
router.post('/deleteUser', authController.deleteUser)

//request account
router.post('/requestAccount', authController.requestAccount)

//give admin status
router.post('/makeAdmin', authController.makeAdmin)

//remove admin status
router.post('/noAdmin', authController.removeAdmin)

//prompt reverification
router.post('/reverify', authController.reverify)

//search pets form submission
router.post('/search', authController.searchPets);

module.exports = router;