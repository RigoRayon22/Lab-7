const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "quotes_admin_secret_key",
    resave: false,
    saveUninitialized: false
  })
);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "sh4ob67ph9l80v61.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
  user: process.env.DB_USER || "w9c7lwn8um1o99yj",
  password: process.env.DB_PASSWORD || "u3rw8lbcasz2h307",
  database: process.env.DB_NAME || "pyn5h5u7iu857dd2",
  connectionLimit: 10,
  waitForConnections: true
});

function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login");
}

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/home");
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM admins WHERE username = ? AND password = ?",
      [username, password]
    );

    if (rows.length > 0) {
      req.session.user = {
        adminId: rows[0].adminId,
        username: rows[0].username
      };
      return res.redirect("/home");
    }

    res.render("login", { error: "Invalid username or password." });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.render("login", { error: err.message });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/home", isAuthenticated, (req, res) => {
  res.render("home");
});

app.get("/authors", isAuthenticated, async (req, res) => {
  const [authors] = await pool.query(`
    SELECT authorId, firstName, lastName, dob, sex, biography
    FROM authors
    ORDER BY lastName, firstName
  `);

  res.render("authors", { authors });
});

app.get("/addAuthor", isAuthenticated, (req, res) => {
  res.render("addAuthor", { error: null });
});

app.post("/addAuthor", isAuthenticated, async (req, res) => {
  try {
    const { firstName, lastName, dob, sex, bio } = req.body;

    if (!firstName || !lastName || !dob || !sex || !bio) {
      return res.render("addAuthor", { error: "All fields are required." });
    }

    await pool.query(
      `INSERT INTO authors (firstName, lastName, dob, sex, biography)
       VALUES (?, ?, ?, ?, ?)`,
      [firstName, lastName, dob, sex, bio]
    );

    res.redirect("/authors");
  } catch (err) {
    console.error(err);
    res.render("addAuthor", { error: "Unable to add author." });
  }
});

app.get("/updateAuthor", isAuthenticated, async (req, res) => {
  const authorId = req.query.authorId;

  const [rows] = await pool.query(
    `SELECT authorId, firstName, lastName,
            DATE_FORMAT(dob, '%Y-%m-%d') AS ISOdob,
            sex, biography
     FROM authors
     WHERE authorId = ?`,
    [authorId]
  );

  if (rows.length === 0) return res.redirect("/authors");

  res.render("updateAuthor", {
    authorInfo: rows[0],
    error: null
  });
});

app.post("/updateAuthor", isAuthenticated, async (req, res) => {
  try {
    const { authorId, firstName, lastName, dob, sex, bio } = req.body;

    await pool.query(
      `UPDATE authors
       SET firstName = ?, lastName = ?, dob = ?, sex = ?, biography = ?
       WHERE authorId = ?`,
      [firstName, lastName, dob, sex, bio, authorId]
    );

    res.redirect("/authors");
  } catch (err) {
    console.error(err);
    res.redirect("/authors");
  }
});

app.get("/deleteAuthor", isAuthenticated, async (req, res) => {
  try {
    const authorId = req.query.authorId;

    await pool.query("DELETE FROM quotes WHERE authorId = ?", [authorId]);
    await pool.query("DELETE FROM authors WHERE authorId = ?", [authorId]);

    res.redirect("/authors");
  } catch (err) {
    console.error(err);
    res.redirect("/authors");
  }
});

app.get("/quotes", isAuthenticated, async (req, res) => {
  const [quotes] = await pool.query(`
    SELECT q.quoteId, q.quote, q.category, q.authorId,
           a.firstName, a.lastName
    FROM quotes q
    JOIN authors a ON q.authorId = a.authorId
    ORDER BY q.quote
  `);

  res.render("quotes", { quotes });
});

app.get("/addQuote", isAuthenticated, async (req, res) => {
  const [authorList] = await pool.query(`
    SELECT authorId, firstName, lastName
    FROM authors
    ORDER BY lastName, firstName
  `);

  const [categoryList] = await pool.query(`
    SELECT DISTINCT category
    FROM quotes
    WHERE category IS NOT NULL AND category <> ''
    ORDER BY category
  `);

  res.render("addQuote", {
    authorList,
    categoryList,
    error: null
  });
});

app.post("/addQuote", isAuthenticated, async (req, res) => {
  try {
    const { quote, category, authorId } = req.body;

    if (!quote || !category || !authorId) {
      return res.redirect("/addQuote");
    }

    await pool.query(
      `INSERT INTO quotes (quote, category, authorId)
       VALUES (?, ?, ?)`,
      [quote, category, authorId]
    );

    res.redirect("/quotes");
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

app.get("/updateQuote", isAuthenticated, async (req, res) => {
  try {
    const quoteId = req.query.quoteId;

    const [quoteRows] = await pool.query(
      "SELECT * FROM quotes WHERE quoteId = ?",
      [quoteId]
    );

    if (quoteRows.length === 0) return res.redirect("/quotes");

    const [authorList] = await pool.query(`
      SELECT authorId, firstName, lastName
      FROM authors
      ORDER BY lastName, firstName
    `);

    const [categoryList] = await pool.query(`
      SELECT DISTINCT category
      FROM quotes
      WHERE category IS NOT NULL AND category <> ''
      ORDER BY category
    `);

    res.render("updateQuote", {
      quoteInfo: quoteRows[0],
      authorList,
      categoryList,
      error: null
    });
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

app.post("/updateQuote", isAuthenticated, async (req, res) => {
  try {
    const { quoteId, quote, category, authorId } = req.body;

    await pool.query(
      `UPDATE quotes
       SET quote = ?, category = ?, authorId = ?
       WHERE quoteId = ?`,
      [quote, category, authorId, quoteId]
    );

    res.redirect("/quotes");
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

app.get("/deleteQuote", isAuthenticated, async (req, res) => {
  try {
    const quoteId = req.query.quoteId;

    await pool.query("DELETE FROM quotes WHERE quoteId = ?", [quoteId]);

    res.redirect("/quotes");
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});