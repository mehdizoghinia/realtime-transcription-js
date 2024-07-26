require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
app.use(express.static("public"));
app.use(
  "/assemblyai.js",
  express.static(
    path.join(__dirname, "node_modules/assemblyai/dist/assemblyai.umd.js")
  )
);
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post("/transcribe", upload.single("file"), async (req, res) => {
  try {
    const fileBuffer = req.file.buffer;

    // Create a form and append the file buffer with appropriate metadata
    const form = new FormData();
    form.append("file", fileBuffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    form.append("model", "whisper-1");

    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    res.json({ transcript: response.data.text });
  } catch (error) {
    console.error(
      "Error transcribing audio:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Error transcribing audio" });
  }
});

app.set("port", 8000);
const server = app.listen(app.get("port"), () => {
  console.log(
    `Server is running on port http://localhost:${server.address().port}`
  );
});
