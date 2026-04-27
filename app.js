const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "quotes_admin_secret_key",
    resave: false,
    saveUninitialized: false
  })
);

// database connection
const pool = mysql.createPool({
  host: "sh4ob67ph9l80v61.cbetxkdyhwsb.us-east-1.rds.amazonaws.com",
  user: "w9c7lwn8um1o99yj",
  password: "u3rw8lbcasz2h307",
  database: "pyn5h5u7iu857dd2",
  connectionLimit: 10,
  waitForConnections: true
});

// auth middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect("/login");
}

// make session user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// root
app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  res.redirect("/login");
});

// login page
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// login action
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const sql = `SELECT * FROM admins WHERE username = ? AND password = ?`;
    const [rows] = await pool.query(sql, [username, password]);

    if (rows.length > 0) {
      req.session.user = {
        adminId: rows[0].adminId,
        username: rows[0].username
      };
      return res.redirect("/home");
    }

    return res.render("login", { error: "Invalid username or password." });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.render("login", { error: err.message });
  }
});

// logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// home
app.get("/home", isAuthenticated, (req, res) => {
  res.render("home");
});

// show all authors
app.get("/authors", isAuthenticated, async (req, res) => {
  const sql = `
    SELECT authorId, firstName, lastName, dob, sex, biography
    FROM authors
    ORDER BY lastName, firstName
  `;
  const [authors] = await pool.query(sql);
  res.render("authors", { authors });
});

// show add author form
app.get("/addAuthor", isAuthenticated, (req, res) => {
  res.render("addAuthor", { error: null });
});

// add author
app.post("/addAuthor", isAuthenticated, async (req, res) => {
  try {
    const { firstName, lastName, dob, sex, bio } = req.body;

    if (!firstName || !lastName || !dob || !sex || !bio) {
      return res.render("addAuthor", { error: "All fields are required." });
    }

    const sql = `
      INSERT INTO authors (firstName, lastName, dob, sex, biography)
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.query(sql, [firstName, lastName, dob, sex, bio]);

    res.redirect("/authors");
  } catch (err) {
    console.error(err);
    res.render("addAuthor", { error: "Unable to add author." });
  }
});

// show update author form
app.get("/updateAuthor", isAuthenticated, async (req, res) => {
  const authorId = req.query.authorId;

  const sql = `
    SELECT authorId, firstName, lastName,
           DATE_FORMAT(dob, '%Y-%m-%d') AS ISOdob,
           sex, biography
    FROM authors
    WHERE authorId = ?
  `;
  const [authorRows] = await pool.query(sql, [authorId]);

  if (authorRows.length === 0) {
    return res.redirect("/authors");
  }

  res.render("updateAuthor", {
    authorInfo: authorRows[0],
    error: null
  });
});

// update author
app.post("/updateAuthor", isAuthenticated, async (req, res) => {
  try {
    const { authorId, firstName, lastName, dob, sex, bio } = req.body;

    if (!firstName || !lastName || !dob || !sex || !bio) {
      return res.render("updateAuthor", {
        authorInfo: {
          authorId,
          firstName,
          lastName,
          ISOdob: dob,
          sex,
          biography: bio
        },
        error: "All fields are required."
      });
    }

    const sql = `
      UPDATE authors
      SET firstName = ?, lastName = ?, dob = ?, sex = ?, biography = ?
      WHERE authorId = ?
    `;
    await pool.query(sql, [firstName, lastName, dob, sex, bio, authorId]);

    res.redirect("/authors");
  } catch (err) {
    console.error(err);
    res.redirect("/authors");
  }
});

// delete author
app.get("/deleteAuthor", isAuthenticated, async (req, res) => {
  try {
    const authorId = req.query.authorId;

    await pool.query(`DELETE FROM quotes WHERE authorId = ?`, [authorId]);
    await pool.query(`DELETE FROM authors WHERE authorId = ?`, [authorId]);

    res.redirect("/authors");
  } catch (err) {
    console.error(err);
    res.redirect("/authors");
  }
});

// show all quotes
app.get("/quotes", isAuthenticated, async (req, res) => {
  const sql = `
    SELECT q.quoteId, q.quote, q.category, q.authorId,
           a.firstName, a.lastName
    FROM quotes q
    JOIN authors a ON q.authorId = a.authorId
    ORDER BY q.quote
  `;
  const [quotes] = await pool.query(sql);
  res.render("quotes", { quotes });
});

// show add quote form
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

// add quote
app.post("/addQuote", isAuthenticated, async (req, res) => {
  try {
    const { quote, category, authorId } = req.body;

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

    if (!quote || !category || !authorId) {
      return res.render("addQuote", {
        authorList,
        categoryList,
        error: "All fields are required."
      });
    }

    const sql = `
      INSERT INTO quotes (quote, category, authorId)
      VALUES (?, ?, ?)
    `;
    await pool.query(sql, [quote, category, authorId]);

    res.redirect("/quotes");
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

// show update quote form
app.get("/updateQuote", isAuthenticated, async (req, res) => {
  const quoteId = req.query.quoteId;

  const [quoteRows] = await pool.query(
    `SELECT * FROM quotes WHERE quoteId = ?`,
    [quoteId]
  );

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

  if (quoteRows.length === 0) {
    return res.redirect("/quotes");
  }

  res.render("updateQuote", {
    quoteInfo: quoteRows[0],
    authorList,
    categoryList,
    error: null
  });
});

// update quote
app.post("/updateQuote", isAuthenticated, async (req, res) => {
  try {
    const { quoteId, quote, category, authorId } = req.body;

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

    if (!quote || !category || !authorId) {
      return res.render("updateQuote", {
        quoteInfo: { quoteId, quote, category, authorId },
        authorList,
        categoryList,
        error: "All fields are required."
      });
    }

    const sql = `
      UPDATE quotes
      SET quote = ?, category = ?, authorId = ?
      WHERE quoteId = ?
    `;
    await pool.query(sql, [quote, category, authorId, quoteId]);

    res.redirect("/quotes");
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

// delete quote
app.get("/deleteQuote", isAuthenticated, async (req, res) => {
  try {
    const quoteId = req.query.quoteId;
    await pool.query(`DELETE FROM quotes WHERE quoteId = ?`, [quoteId]);
    res.redirect("/quotes");
  } catch (err) {
    console.error(err);
    res.redirect("/quotes");
  }
});

// database test
app.get("/dbTest", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT CURDATE() AS today");
    res.send(rows);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Database error!");
  }
});

// check admins table
app.get("/checkAdmins", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM admins");
    res.send(rows);
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
});

app.listen(3000, () => {
  console.log("Express server running on http://localhost:3000");
});