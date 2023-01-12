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



// ROTA DE LOGIN



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

      return res.status(201).send();
    } catch (err) {
      return res.status(422).send();
    }
    
  
  
    
  })
// ROTAS:

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running in port: ${PORT}`));