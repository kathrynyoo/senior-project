// "npm start" to run

const express = require('express');
const mysql = require("mysql");
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser');

dotenv.config({ path: './.env'});
const app = express();

const db = mysql.createConnection({
    //use ip adress for host when server is used
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE
});

//set up public directory
const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));

//Parse url-encoded bodies (sent by HTML forms)
app.use(express.urlencoded({ extended: false }));

//Parse JSON bodies (as sent by API clients)
app.use(express.json());
app.use(cookieParser());

//set handlebars as view engine
app.set('view engine', 'hbs');

db.connect( (error) => {
    if(error) {
        console.log(error);
    }
    else {
        console.log("mysql connected");
    }
})

//Define routes from routes folder
app.use('/', require('./routes/pages'));

//Define routes for authorization
app.use('/auth', require('./routes/auth'))

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`server started on port ${PORT}`));