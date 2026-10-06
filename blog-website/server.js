const path = require("path");
const express = require("express");
const helmet = require("helmet");
const { sessionMiddleware } = require("./src/session");
const publicRoutes = require("./src/routes/public");
const adminRoutes = require("./src/routes/admin");

const app = express();
const port = Number(process.env.PORT) || 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://code.jquery.com", "https://cdn.jsdelivr.net", "https://cdn.ckeditor.com"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net",
          "https://cdn.ckeditor.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "200kb" }));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/images", express.static(path.join(__dirname, "images")));
app.use("/scripts.js", express.static(path.join(__dirname, "scripts.js")));
app.use(sessionMiddleware);

app.use(publicRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).render("error", { pageTitle: "Not found", message: "That page does not exist." });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).render("error", { pageTitle: "Error", message: "Something went wrong. Try that again." });
});

app.listen(port, () => {
  console.log(`LatestNews is running at http://localhost:${port}`);
});
