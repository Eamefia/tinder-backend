import express from "express";
import mongoose from 'mongoose';
import Messages from "./dbMessages.js";
import Signup from "./signup.js";
import Pusher from "pusher";
import cors from 'cors';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();



// app config

const app = express();
const port = process.env.PORT || 8001;

const storage = multer.diskStorage({
  destination: (req, file, callback) =>{
    callback(null, "../tinder-clone/public/uploads/");
  },
  filename: (req, file, callback) =>{
    callback(null, file.originalname);
  }
})

const upload = multer({storage: storage});

const pusher = new Pusher({
    appId: "1225889",
    key: "d954810e751705611020",
    secret: "d1b7272f93ea266f206f",
    cluster: "eu",
    useTLS: true
  });

//  middlewares
app.use(express.json());
app.use(cors({
    origin: ["http://localhost:3000", "https://tinder-clon.netlify.app"],
    credentials: true
}));
app.use(cookieParser());

// DB config
const connection_url = process.env.MONGODB_CONNECTION;
mongoose.connect(connection_url, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;

db.once("open", () => {
    console.log('DB connected');

    const msgCollection = db.collection('messagecontents');
    const changeStream = msgCollection.watch();



    changeStream.on('change', (change) => {
        console.log(change);

        if (change.operationType === "insert") {
            const messageDetails = change.fullDocument;
            pusher.trigger("messages", "inserted", {
                message: messageDetails.message,
                receiverId: messageDetails.receiverId,
                senderId: messageDetails.senderId,
            });
        }else{
            console.log("Error triggering pusher");
        }
    });
});


// api routes
app.get('/', (req, res) =>res.status(200).send('hello world'));

app.get('/messages/:chatUserId', async (req, res) => {

  try {
    const chatmessages = await Messages.find({
      $or :[
         {senderId: req.params.chatUserId},
         {receiverId: req.params.chatUserId},
      ]
    });
    res.status(200).json(chatmessages);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.get('/messages/:sender/:receiver', async (req, res) => {
  try {
    const conversations = await Messages.find({
      $or: [
        {senderId: req.params.sender, receiverId: req.params.receiver},
        {senderId: req.params.receiver, receiverId: req.params.sender}
      ]
    });
    res.status(200).json(conversations);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.get('/userprofile/:userId', async (req, res) =>{
  try {
    const user = await Signup.findById(req.params.userId);
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json(err);
  }
})



app.post('/messages/new', async (req, res)=>{

  try {
    const dbMessage = req.body;
    const senderId = req.body.senderId;
    const receiverId = req.body.receiverId;
    const message = req.body.message;
    const existingusername = await Messages.findOne({ receiverId });
    if (!existingusername) {
      Messages.create(dbMessage, (err, data)=>{
        if(err){
            res.status(500).send(err);
        }else{
            res.status(201).send(data);
        }
    });
    }else{
        Messages.create({
        message,
        receiverId,
        senderId,
      }, (err, data) => {
        if(err){
          res.status(500).send(err);
         }else{
          res.status(201).send(data);
         }
      })
    }
  } catch (err) {
    console.log(err);
    
  }


});

 // Register user
app.post('/signup/new', upload.single("profileImg"), async (req, res)=>{
    try {
        const fname = req.body.fname;
        const lname = req.body.lname;
        const email = req.body.email;
        const password = req.body.password;
        const profileImg = req.file.filename;
        
        
        // validation
    
        if ( !fname || !lname || !email || !password )
          return res
            .status(400)
            .json({ errorMessage: "Please enter all required fields." });
    
        if (password.length < 6)
          return res.status(400).json({
            errorMessage: "Please enter a password of at least 6 characters.",
          });
    
    
        const existingUser = await Signup.findOne({ email });
        if (existingUser)
          return res.status(400).json({
            errorMessage: "An account with this email already exists.",
          });
    
        // hash the password
    
        const salt = await bcrypt.genSalt();
        const passwordhash = await bcrypt.hash(password, salt);

    
        // save a new user account to the db
    
        const newUser = new Signup({
          fname,
          lname,
          email,
          passwordhash,
          profileImg,
        });
    
        const savedUser = await newUser.save();
    
        // sign the token
    
        const token = jwt.sign(
          {
            user: savedUser._id,
          },
          process.env.JWT_SECRET
        );
    
        // send the token in a HTTP-only cookie
    
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
          })
          .send();
      } catch (err) {
        console.error(err);
        res.status(500).send();
      }
  });

  app.get("/users/:uid", async (req, res) =>{
    try {
      const user = await Signup.find({ _id: { $ne: req.params.uid }});
      res.status(200).json(user);
    } catch (err) {
      res.status(500).json(err);
    }
      
  });


    //validate to login the user
    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;
    
        // validate
    
        if (!email || !password)
          return res
            .status(400)
            .json({ errorMessage: "Please enter all required fields." });
    
        const existingUser = await Signup.findOne({ email });
        if (!existingUser)
          return res.status(401).json({ errorMessage: "Wrong email or password." });
    
        const passwordCorrect =  await bcrypt.compare(password, existingUser.passwordhash)
        if (!passwordCorrect)
          return res.status(401).json({ errorMessage: "Wrong email or password." });
    
        // sign the token
    
        const token = jwt.sign(
          {
            user: existingUser._id,
          },
          process.env.JWT_SECRET
        );
    
        // send the token in a HTTP-only cookie
    
       res
          .cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
          })
          .send();
      } catch (err) {
        console.error(err);
        res.status(500).send();
      }
    });
     
    // logout the user
   app.get("/logout", (req, res) => {
      res
        .cookie("token", "", {
          httpOnly: true,
          expires: new Date(0),secure: true,
          secure: true,
          sameSite: "none",
        })
        .send();
    });
      // get the logged in user
    app.get("/loggedIn", (req, res) => {
        try {
          const token = req.cookies.token;
          if (!token) return res.json(false);
      
          jwt.verify(token, process.env.JWT_SECRET);
      
          res.send(true);
        } catch (err) {
          res.json(false);
        }
      });

      app.get("/getToken", (req, res) => {
        try {
          const token = req.cookies.token;
          if (!token) return res.json(false);
      
          jwt.verify(token, process.env.JWT_SECRET);
      
          res.json({ token });
        } catch (err) {
          res.json(false);
        }
      });


      app.get('/chatUsers/:sender', async (req, res) => {
        try {
          const conversations = await Messages.find({ username: {$exists: true}, $or: [
            {senderId: req.params.sender},
            {receiverId: req.params.sender}
          ]
          });
          res.status(200).json(conversations);
        } catch (err) {
          res.status(500).json(err);
        }
      });

    app.get('/users/:userId', async (req, res) => {
      try {
        Signup.aggregate([
          {$match: { _id : userId }},
          {$lookup:{
              from: 'messagecontents',
              localField: '_id',
              $or :[{foreignField: 'receiverId'}, {foreignField: 'senderId'}],
              as : 'users'
          }}
          ])
      .exec((err, result) => {
        if (err) {
          res.send(err)
        }
        if (result) {
          res.send({
            error: false,
            data: result
          })
        }
      })
      } catch (error) {
        console.log(error);
        
      }
    })



// listener
app.listen(port, () => console.log(`Listening on lacalhost:${port}`));