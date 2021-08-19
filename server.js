import express from 'express';
import mongoose from 'mongoose';
import Cors from "cors";
import jwt from "jsonwebtoken";
import Signup from "./signup.js";
import Pusher from "pusher";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import multer from "multer";
import Messages from "./dbMessages.js";
import crypto from "crypto";

dotenv.config();



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
// App config
const app = express();
const port = process.env.PORT || 8001;


// Middlewares
app.use(express.json());
app.use(Cors({origin: ["http://localhost:3000", "https://tinder-clon.netlify.app"], credentials: true}));
app.use(cookieParser());

// DB config
const connection_url = process.env.MONGODB_CONNECTION;
mongoose.connect(connection_url, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
})

const db = mongoose.connection;
 db.once("open", () => {
  console.log('DB is connected');
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
  })

//  API Endpoints
app.get("/", (req, res) => res.status(200).send("Hello its working"));




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
        const unique_id = crypto.randomBytes(16).toString("hex");

    
        // save a new user account to the db
    
        const newUser = new Signup({
          unique_id,
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
        console.log(token);
        
    
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
      const user = await Signup.find({ unique_id: { $ne: req.params.uid}});
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
          expires: new Date(0),
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

      app.post('/messages/new', (req, res)=>{
        const dbMessage = req.body;
    
        Messages.create(dbMessage, (err, data)=>{
            if(err){
                res.status(500).send(err);
            }else{
                res.status(201).send(data);
            }
        });
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

      app.get("/chatUsers/:userId", async (req, res) =>{
        try {
          const id = req.params.userId;
           const users = await Signup.aggregate([
            {$match: { unique_id : id }},
            {$lookup:{
                from: 'messagecontents',
                localField: 'unique_id',
                foreignField: { $or: ['senderId', 'receiverId'] },
                as : 'users'
            }}
            ])
             .exec();
             res.status(200).send(users)
        } catch (err) {
          res.status(500).json(err);
        }
      });

      app.get('/chatUsers/:chatUserId', async (req, res) => {

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




// Listener
app.listen(port, () => console.log(`listening on localhost: ${port}`));