require('dotenv').config();

const express = require("express");
const compression = require("compression");
const mysql = require("mysql2");
const cors = require("cors");

const port = process.env.PORT || 5000;
const app = express();

const jwt = require("jsonwebtoken");
const exjwt = require("express-jwt");
const bodyParser = require("body-parser");
const path = require("path");

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://personal-budget-m1e1.onrender.com");
  res.setHeader("Access-Control-Allow-Headers", "Content-type,Authorization");
  next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  compression({
    level: 6,
  })
);
app.use(cors());
app.use(express.json());

const secretKey = "My super secret key";
const refreshSecretKey = "Another super secret key";

const jwtMW = exjwt({
  secret: secretKey,
  algorithms: ["HS256"],
  // isRevoked: isRevokedCallback
});

var db = mysql.createPool({
  host: MYSQL_HOST_NAME,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: "sql5668586",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const randomColor = () => {
  const randomColor = Math.floor(Math.random() * 16777215).toString(16);
  return `#${randomColor.padStart(6, "0")}`;
};

const encryptPassword = (salt, text) => {
  const textToChars = (text) => text.split("").map((c) => c.charCodeAt(0));
  const byteHex = (n) => ("0" + Number(n).toString(16)).substr(-2);
  const applySaltToChar = (code) =>
    textToChars(salt).reduce((a, b) => a ^ b, code);

  return text
    .split("")
    .map(textToChars)
    .map(applySaltToChar)
    .map(byteHex)
    .join("");
};


app.get("/", async (req, res) => {
  res.json("Hello");
});

app.get("/budget", jwtMW, async (req, res) => {
  const sql = "SELECT * FROM budget";
  db.query(sql, (error, data) => {
    if (error) throw error;
    res.json(data);
  });
});

app.get("/expense", jwtMW, async (req, res) => {
    const sql = "SELECT * FROM spent";
    db.query(sql, (error, data) => {
      if (error) throw error;
      res.json(data);
    });
  });

app.post("/add-budget", async (req, res) => {
    const { budgets } = req.body;

    const queries = budgets.map((budget, index) => {
        const sql = "UPDATE budget SET budget = ? WHERE id = ?";
        const values = [budget, index + 1];
        return db.promise().query(sql, values);
      });
    
      try {
        // Execute all queries in parallel
        const results = await Promise.all(queries);
        res.json(results);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
      }

  });

  app.post("/add-expenses", async (req, res) => {
    const { expenses } = req.body;

    const queries = expenses.map((expense, index) => {
        const sql = "UPDATE spent SET spent = ? WHERE id = ?";
        const values = [expense, index + 1];
        return db.promise().query(sql, values);
      });
    
      try {
        // Execute all queries in parallel
        const results = await Promise.all(queries);
        res.json(results);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
      }

  });

// transform to mySQL date format
function transformDate(date = new Date()) {
  return date.toISOString().split("T")[0];
}

app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body;
  const pwd = encryptPassword("salt", password); //would create encryptPassword function
  const date = transformDate(); //would create transformDate function
  db.connect();
  db.query(
    'INSERT INTO user VALUES("", ?, ?, ?)',
    [username, pwd, date],
    function (error, results) {
      db.end();
      if (error) throw error;
      res.json(results);
    }
  );
});

let refreshTokens = [];

//new access token from refresh token
app.post("/token", (req, res) => {
  const refreshToken = req.body.token;
  if (refreshToken == null) return res.sendStatus(401);
  if (!refreshTokens.includes(refreshToken)) return res.sendStatus(403);

  jwt.verify(refreshToken, refreshSecretKey, (err, user) => {
    if (err) return res.sendStatus(403);
    const accessToken = jwt.sign({ username: user.username }, secretKey, {
      expiresIn: "1m",
    });
    res.json({ accessToken: accessToken });
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM user WHERE username = ? AND password = ?";
  const pwd = encryptPassword("salt", password);

  db.query(sql, [username, pwd], function (error, results) {
    if (error) throw error;
    if (results.length > 0) {
      const accessToken = jwt.sign({ username, password }, secretKey, {
        expiresIn: "1m",
      });
      const refreshToken = jwt.sign({ username, password }, refreshSecretKey, {
        expiresIn: "5m",
      });
      refreshTokens.push(refreshToken);
      res.json({ accessToken, refreshToken });
    } else {
      res.json("User not found: Invalid login");
    }
  });
});

//when users try to reach a protected url without authorization
app.use(function (err, req, res, next) {
  if (err.name === "UnauthorizedError") {
    res.status(401).json({
      success: false,
      officialError: err,
      err: "Username or password is incorrect 2",
    });
  } else {
    next(err);
  }
});

//delete refresh token when logged out
app.delete("/logout", (req, res) => {
  const refreshToken = req.headers["authorization"];
  refreshTokens = refreshTokens.filter((token) => token !== refreshToken);
  res.sendStatus(204);
});

app.listen(() => {
  console.log(`API served at https://personal-budget-api.onrender.com:${port}`);
});
