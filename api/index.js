const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const bycrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const imageDownloader = require('image-downloader')
const Place = require('./models/Place.js')
const cookieParser = require("cookie-parser");
const multer = require('multer')
const fs =  require('fs');
const Booking = require("./models/Booking.js");
const { resolve } = require("path");

require("dotenv").config();
const app = express();

const bycryptSalt = bycrypt.genSaltSync(10);
const jwtSecret = process.env.JWT_TOKEN;
// const jwtSecret = "fsagdgfgfdfgbgfd";

app.use(express.json());
app.use(cookieParser());
// Serve static files (uploads)
app.use('/uploads', express.static(__dirname + '/uploads'));


//databse connect
mongoose.connect(process.env.MONGO_URL);

//utility func
function getUserDataFromReq(req){
  return new Promise((resolve,reject)=>{
    jwt.verify(req.cookies.token, jwtSecret, {}, async (err, userData) => {
      if(err) throw err;
      resolve(userData)
    })
  })
}

// app.use(
//   cors({
//     credentials: true,//allow cross origin request
//     origin: "http://localhost:5173",
//   })
// );


const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Example Route
app.post('/register', (req, res) => {
  res.json({ message: 'User registered successfully!' });
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



//for testing
app.get("/test", (req, res) => {
  res.json("test ok");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const userDoc = await User.create({
      name,
      email,
      password: bycrypt.hashSync(password, bycryptSalt),
    });
    res.json(userDoc);
  } catch (e) {
    res.status(422).json(e);
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const userDoc = await User.findOne({ email });
  if (userDoc) {
    const passOk = bycrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        {  
          email: userDoc.email,
          id: userDoc._id,
        },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token).json(userDoc);
        }
      );
    } else {
      res.status(422).json("pass not ok");
    }
  } else {
    res.json("Not Found");
  }
});

app.get("/profile", (req, res) => {
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, {}, async (err, userData) => {
      if (err) throw err;
      const { name, email, _id } = await User.findById(userData.id);
      res.json({ name, email, id: _id });
    });
  } else {
    res.json(null);
  }
});


app.post('/logout',(req,res) => {
    res.cookie('token',"").json(true);//clear
})

app.post('/upload-by-link', async (req, res) => {
    const { link } = req.body;
    const newName = 'photo' + Date.now() + '.jpg';
    const dest = __dirname + '/uploads/' + newName;

    try {
        await imageDownloader.image({
            url: link,
            dest: dest
        });
        res.json(newName);
    } catch (error) {
        console.error("Error downloading image:", error.message);
        res.status(500).json({ error: "Failed to download image" });
    }
});

const photosMiddleware = multer({dest:'uploads/'})
app.post('/upload', photosMiddleware.array('photos',100),(req,res)=>{
  const uploadedFiles = [];  
  for(let i=0;i<req.files.length;i++){
      const {path,originalname} = req.files[i];
      const parts = originalname.split('.')//sep extension
      const ext = parts[parts.length-1]
      const newPath = path + '.' + ext;
      fs.renameSync(path,newPath)
      uploadedFiles.push(newPath.replace('uploads/',''));
    }
    res.json(uploadedFiles);
})

app.post('/places', (req,res)=>{
  const {token} = req.cookies;
  const {
    title,address,addedPhotos,description,price
    ,perks,extraInfo,checkIn,checkOut,maxGuests,
  } = req.body;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if (err) throw err;
    const placeDoc = await Place.create({
      owner: userData.id,price,
      title,address,photos:addedPhotos,description
      ,perks,extraInfo,checkIn,checkOut,maxGuests,
    })
    res.json(placeDoc)
  });
})

//give places owned by user
app.get('/user-places',(req,res)=>{
  const {token} = req.cookies;
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    const {id} = userData;
    res.json(await Place.find({owner:id}))
  });

})
//give the details of a specific place by its unique id
app.get('/places/:id',async (req,res)=>{
  const {id} = req.params;
  res.json(await Place.findById(id))
})

app.put('/places',async(req,res)=>{  //edit
  const {token} = req.cookies;
  const {
    id, title,address,addedPhotos,description
    ,perks,extraInfo,checkIn,checkOut,maxGuests,price,
  } = req.body;
  
  jwt.verify(token, jwtSecret, {}, async (err, userData) => {
    if(err) throw err;

    const placeDoc = await Place.findById(id);
    if(userData.id === placeDoc.owner.toString()){
      placeDoc.set({
        title,address,photos:addedPhotos,description
        ,perks,extraInfo,checkIn,checkOut,maxGuests,price
      })
      await placeDoc.save();
      res.json('ok')
    }
  })
})

app.get('/places',async (req,res)=>{
  res.json(await Place.find())
})

app.post('/bookings', async (req,res)=>{

  const userData = await getUserDataFromReq(req);
  const {
    place,checkIn,checkOut,
    numberOfGuests,name,phone,price
  } = req.body;

   Booking.create({
    place,checkIn,checkOut,
    numberOfGuests,name,phone,price,
    user:userData.id,
  }).then((doc)=>{
    res.json(doc)
  }).catch((err)=>{
    throw err;
  })

})



app.get('/bookings',async (req,res)=>{
  const userData = await getUserDataFromReq(req);
  res.json(await Booking.find({user:userData.id}).populate('place'))//used to replace a refrenced obj id in document with the actual document id
})
app.listen(4000);

// const express = require("express");
// const cors = require("cors");
// const mongoose = require("mongoose");
// const User = require("./models/User");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const imageDownloader = require("image-downloader");
// const Place = require("./models/Place.js");
// const cookieParser = require("cookie-parser");
// const multer = require("multer");
// const fs = require("fs");
// const Booking = require("./models/Booking.js");

// require("dotenv").config(); // Load .env variables
// const app = express();

// // Constants
// const bcryptSalt = bcrypt.genSaltSync(10);
// const jwtSecret = "fsagdgfgfdfgbgfd";
// const PORT = 4000;

// // Middleware
// app.use(express.json());
// app.use(cookieParser());
// app.use(cors({ credentials: true, origin: "http://localhost:5173" }));
// app.use("/uploads", express.static(__dirname + "/uploads"));

// // MongoDB Connection
// const mongoURI = process.env.MONGO_URL;

// // Debugging: Check if MONGO_URL is loaded
// if (!mongoURI) {
//   console.error("MongoDB URI (MONGO_URL) is not defined in .env file!");
//   process.exit(1); // Exit if no URI is provided
// }

// mongoose
//   .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log("Connected to MongoDB"))
//   .catch((err) => {
//     console.error("Failed to connect to MongoDB:", err.message);
//     process.exit(1);
//   });

// // Utility Function
// function getUserDataFromReq(req) {
//   return new Promise((resolve, reject) => {
//     jwt.verify(req.cookies.token, jwtSecret, {}, (err, userData) => {
//       if (err) return reject(err);
//       resolve(userData);
//     });
//   });
// }

// // Routes
// app.get("/test", (req, res) => res.json("test ok"));

// app.post("/register", async (req, res) => {
//   const { name, email, password } = req.body;
//   try {
//     const userDoc = await User.create({
//       name,
//       email,
//       password: bcrypt.hashSync(password, bcryptSalt),
//     });
//     res.json(userDoc);
//   } catch (e) {
//     res.status(422).json(e);
//   }
// });

// app.post("/login", async (req, res) => {
//   const { email, password } = req.body;
//   const userDoc = await User.findOne({ email });
//   if (userDoc) {
//     const passOk = bcrypt.compareSync(password, userDoc.password);
//     if (passOk) {
//       jwt.sign(
//         { email: userDoc.email, id: userDoc._id },
//         jwtSecret,
//         {},
//         (err, token) => {
//           if (err) throw err;
//           res.cookie("token", token).json(userDoc);
//         }
//       );
//     } else {
//       res.status(422).json("Password incorrect");
//     }
//   } else {
//     res.status(404).json("User not found");
//   }
// });

// app.get("/profile", async (req, res) => {
//   const { token } = req.cookies;
//   if (!token) return res.json(null);

//   try {
//     const userData = jwt.verify(token, jwtSecret);
//     const { name, email, _id } = await User.findById(userData.id);
//     res.json({ name, email, id: _id });
//   } catch (err) {
//     res.status(401).json("Invalid token");
//   }
// });

// app.post("/logout", (req, res) => {
//   res.cookie("token", "").json(true);
// });

// app.post("/upload-by-link", async (req, res) => {
//   const { link } = req.body;
//   const newName = "photo" + Date.now() + ".jpg";
//   const dest = __dirname + "/uploads/" + newName;

//   try {
//     await imageDownloader.image({ url: link, dest: dest });
//     res.json(newName);
//   } catch (error) {
//     console.error("Error downloading image:", error.message);
//     res.status(500).json({ error: "Failed to download image" });
//   }
// });

// const photosMiddleware = multer({ dest: "uploads/" });
// app.post("/upload", photosMiddleware.array("photos", 100), (req, res) => {
//   const uploadedFiles = [];
//   req.files.forEach((file) => {
//     const { path, originalname } = file;
//     const ext = originalname.split(".").pop();
//     const newPath = `${path}.${ext}`;
//     fs.renameSync(path, newPath);
//     uploadedFiles.push(newPath.replace("uploads/", ""));
//   });
//   res.json(uploadedFiles);
// });

// app.post("/places", async (req, res) => {
//   const { token } = req.cookies;
//   const { title, address, addedPhotos, description, price, perks, extraInfo, checkIn, checkOut, maxGuests } = req.body;

//   try {
//     const userData = jwt.verify(token, jwtSecret);
//     const placeDoc = await Place.create({
//       owner: userData.id,
//       title,
//       address,
//       photos: addedPhotos,
//       description,
//       price,
//       perks,
//       extraInfo,
//       checkIn,
//       checkOut,
//       maxGuests,
//     });
//     res.json(placeDoc);
//   } catch (err) {
//     res.status(400).json(err.message);
//   }
// });

// // More routes can go here...

// // Start Server
// app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
