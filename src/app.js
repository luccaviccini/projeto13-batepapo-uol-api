import express from "express";
import { MongoClient, ObjectId, Timestamp } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import joi from "joi";
import bcrypt from "bcrypt";
import { v4 as uuidV4 } from 'uuid';
import dayjs from 'dayjs';
import { stripHtml } from "string-strip-html";



const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;


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

    let { name } = req.body; 
    name = stripHtml(name).result.trim(); 
    console.log(name);

    // validade empty string joi 
    const schema = joi.object({
        name: joi.string().min(1).required(),
    });
    const { error } = schema.validate({ name });
    if (error) {
        return res.status(400).send(error.details[0].message);
    }   
    
    const formatedTimestamp = dayjs(Date.now()).format('HH:mm:ss');
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
    let {to, text, type } = req.body;    
    let from = req.headers.user;  

    to = stripHtml(to).result.trim();
    text = stripHtml(text).result.trim();
    type = stripHtml(type).result.trim();
    from = stripHtml(from).result.trim();

    console.log(to, text, type, from);
      
    

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
 
  });

//post status
app.post('/status', async (req, res) => {
  const interval = 15000; // 15 seconds
  const limit = 10000; // 10 seconds
    const name = req.headers.user;
    const user = await UsersCollection.findOne({name: name});
    if (!user) {
      return res.status(404).send('Usuário não encontrado');
    }
    try {  

      // update lastStatus
      await UsersCollection.updateOne
      ({name: name}, {$set: {lastStatus: Date.now()}});
      return res.status(200).send('Status atualizado');
    } catch (err) {
      return res.status(422).send('Erro ao atualizar status');
    }
  });

function deleteInactiveUsers() {
  const interval = 15000; // 15 seconds
  const limit = 10000; // 10 seconds
  setInterval(async () => {
    const users = await UsersCollection.find().toArray();
    users.forEach(async (user) => {
      if (Date.now() - user.lastStatus > limit) {
        const formatedTimestamp = dayjs(Date.now()).format('HH:mm:ss');
        await UsersCollection.deleteOne({ name: user.name });
        await MessagesCollection.insertOne(
          { from: user.name, 
            to: "Todos", 
            text: "sai da sala...", 
            type: "status", 
            time:formatedTimestamp });
      }
    });
  }, interval);
}

deleteInactiveUsers();


// delete selected message
app.delete('/messages/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.headers.user;
      const message = await MessagesCollection.findOne({ _id: ObjectId(id) });
      if (!message) {
        return res.status(404).send('Mensagem não encontrada');
      }
      if (message.from !== user) {
        return res.status(401).send('Usuário não autorizado');
      }
      await MessagesCollection.deleteOne({ _id: ObjectId(id) });
      return res.status(200).send('Mensagem apagada');
    } catch (err) {
      return res.status(422).send('Erro ao apagar mensagem');
    }

  });



const PORT = 5000;
app.listen(PORT, () => console.log(`Server running in port: ${PORT}`));