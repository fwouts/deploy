const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Hello World!\n\n" + process.env["TEST"]));

app.listen(3000, () => console.log("Example app listening on port 3000!"));
