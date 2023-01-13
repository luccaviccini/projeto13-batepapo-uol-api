import express from "express";
import { MongoClient, ObjectId, Timestamp } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import joi from "joi";
import bcrypt from "bcrypt";
import { v4 as uuidV4 } from 'uuid';
import dayjs from 'dayjs';

const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

//const users = [{name: 'João'}]; // O conteúdo do lastStatus será explicado nos próximos requisitos
//const messages = [{from: 'João', to: 'Todos', text: 'oi galera', type: 'message', time: '20:04:37'}];


try {
await mongoClient.connect();
} catch (err) {
console.log("Erro no mongo.conect", err.message);
}

db = mongoClient.db();
const UsersCollection = db.collection("participants");
const MessagesCollection = db.collection("messages");

// post participants
app.post('/participants', async (req, res) => {

    const { name } = req.body;  

    // validade empty string joi 
    const schema = joi.object({
        name: joi.string().min(1).required(),
    });
    const { error } = schema.validate({ name });
    if (error) {
        return res.status(400).send(error.details[0].message);
    }   
    
    let formatedTimestamp = dayjs(Date.now()).format('HH:mm:ss');
    // check if user already exists in db
    const user = await UsersCollection.findOne({name: name})
    
    if (user) {
        return res.status(409).send('Usuário já existe');
    }

    try {
      await db.collection("participants").insertOne({name, lastStatus: Date.now()});
      await db.collection("messages").insertOne({from: name, to: "Todos", text: "entra na sala...", type: "status", time:formatedTimestamp });

      return res.status(201).send("Participante entrou na sala!");
    } catch (err) {
      return res.status(422).send('O participante nao conseguiu entrar na sala');
    } 

  })
// get all participants
app.get('/participants', async (req, res) => {
    const participants = await UsersCollection.find().toArray();
    return res.status(200).send(participants);
  });

// post message
app.post('/messages', async (req, res) => {
    const {to, text, type } = req.body;
    // get User from header
    const from = req.headers.user;    
    

    let formatedTimestamp = dayjs(Date.now()).format('HH:mm:ss');

    // validade empty string joi to and text
    const schema = joi.object({
        to: joi.string().min(1).required(),
        text: joi.string().min(1).required(),
        type: joi.string().valid('message', 'private_message').required(),
    });
    const { error } = schema.validate({ to, text, type });
    const user = await UsersCollection.findOne({name: from})   
    if (error || !user) {
        return res.status(422).send("Erro na validação");
    }

    try {
      await db.collection("messages").insertOne({from, to, text, type, time:formatedTimestamp });
      return res.status(201).send("Mensagem enviada!");
    } catch (err) {
      return res.status(422).send('A mensagem nao foi enviada');
    }
  });

// get all messages
app.get('/messages', async (req, res) => {
    let { limit } = req.query;
    // get user from header
    const user = req.headers.user;
    
    if(!limit) {
      limit = 100;
    }



    // console log type of limit
    const messages = await MessagesCollection.find().toArray();
    // send only to users messages that are only for user
    const filteredMessages = messages.filter(message => {
      if (message.to === user || message.to === 'Todos' || message.from === user) {
        return message;
      }
    });
    
    filteredMessages.splice(0, filteredMessages.length - parseInt(limit));
    return res.status(200).send(filteredMessages);

    // show last 10 messages
    
    
  });



const PORT = 5000;
app.listen(PORT, () => console.log(`Server running in port: ${PORT}`));