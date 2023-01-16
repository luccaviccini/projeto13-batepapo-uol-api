import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";
import utf8 from "utf8";

const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
  await mongoClient.connect();
} catch (err) {
  console.log("Erro no mongo.conect", err.message);
}

const db = mongoClient.db();
const UsersCollection = db.collection("participants");
const MessagesCollection = db.collection("messages");

// post participants
app.post("/participants", async (req, res) => {
  const { name } = req.body;
  // check if name exists
  if (!name) {
    return res.status(422).send("Nome não informado");
  }

  // validade empty string joi
  const schema = joi.object({
    name: joi.string().min(1).required(),
  });

  const { error } = schema.validate({ name });

  if (error) {
    return res.status(422).send(error.details[0].message);
  }

  // check if user already exists in db
  const user = await UsersCollection.findOne({ name: name });
  if (user) {
    return res.status(409).send("Usuário já existe");
  }

  // timestamp related variables
  const DateNow = Date.now();
  const formatedTimestamp = dayjs(Date.now()).format("HH:mm:ss");

  try {
    await UsersCollection.insertOne({ name, lastStatus: DateNow });
    await MessagesCollection.insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: formatedTimestamp,
    });

    return res.status(201).send("Participante entrou na sala!");
  } catch {
    return res.status(422).send("O participante nao conseguiu entrar na sala");
  }
});
// get all participants
app.get("/participants", async (req, res) => {
  const participants = await UsersCollection.find().toArray();
  return res.status(200).send(participants);
});

// post message
app.post("/messages", async (req, res) => {
  let { to, text, type } = req.body;
  let from = req.headers.user;

  //status 422 - without user header
  if (!from) {
    return res.status(422).send("Usuário não informado");
  }

  from = utf8.decode(from);

  


  //status 422 - without to, text or type
  if (!to || !text || !type) {
    return res.status(422).send("Dados incompletos");
    }

  //check if user exists
  const user = await UsersCollection.findOne({ name: from });
  if (!user) {
    return res.status(422).send("Erro na validação");
  }

  // validade empty string joi to and text
  const schema = joi.object({
    to: joi.string().min(1).required(),
    text: joi.string().min(1).required(),
    type: joi.string().valid("message", "private_message").required(),
    from: joi.string().min(1).required(),
  });
  const { error } = schema.validate({ to, text, type, from });
  if (error) {
    return res.status(422).send(error.details[0].message);
  }

  //timestamp related variables
  let formatedTimestamp = dayjs(Date.now()).format("HH:mm:ss");

  try {
    await MessagesCollection.insertOne({
      from: from,
      to: to,
      text: text,
      type: type,
      time: formatedTimestamp,
    });
    return res.status(201).send("Mensagem enviada!");
  } catch (err) {
    return res.status(422).send("A mensagem nao foi enviada");
  }
});

// get all messages
app.get("/messages", async (req, res) => {
  //if there is a limit in the query, use it, otherwise use 100
  let limit = 100;
  if (req.query.limit) {
    limit = parseInt(req.query.limit);
  }

  //check if limit is a number and if it is a positive number
  if (isNaN(limit) || limit <= 0) {
    return res.status(422).send("Limite inválido");
  }

  let {user} = (req.headers);
  //status 422 - without user header
  if (!user) {
    return res.status(422).send("Usuário não informado");
  }
  user = utf8.decode(user);

  let messages;
  try {
    messages = MessagesCollection.find({
      $or: [
        { to: "Todos" }, 
        { to: user }, 
        { from: user }, 
        { type: "message" }
        ]
    }).toArray();

    const messagesReversed = (await messages).slice(-(limit)).reverse();
    return res.status(200).send(messagesReversed);
  } catch {
    return res.status(422).send("Erro ao buscar mensagens");
  }
});

//post status
app.post("/status", async (req, res) => {
  const interval = 15000; // 15 seconds
  const limit = 10000; // 10 seconds
  const name = req.headers.user;
  const user = await UsersCollection.findOne({ name: name });
  if (!user) {
    return res.status(404).send("Usuário não encontrado");
  }
  try {
    // update lastStatus
    await UsersCollection.updateOne(
      { name: name },
      { $set: { lastStatus: Date.now() } }
    );
    return res.status(200).send("Status atualizado");
  } catch (err) {
    return res.status(422).send("Erro ao atualizar status");
  }
});

function deleteInactiveUsers() {
  const interval = 15000; // 15 seconds
  const limit = 10000; // 10 seconds
  setInterval(async () => {
    const users = await UsersCollection.find().toArray();
    users.forEach(async (user) => {
      if (Date.now() - user.lastStatus > limit) {
        const formatedTimestamp = dayjs(Date.now()).format("HH:mm:ss");
        await UsersCollection.deleteOne({ name: user.name });
        await MessagesCollection.insertOne({
          from: user.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: formatedTimestamp,
        });
      }
    });
  }, interval);
}

deleteInactiveUsers();

// delete selected message
app.delete("/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.headers.user;
    const message = await MessagesCollection.findOne({ _id: ObjectId(id) });
    if (!message) {
      return res.status(404).send("Mensagem não encontrada");
    }
    if (message.from !== user) {
      return res.status(401).send("Usuário não autorizado");
    }
    await MessagesCollection.deleteOne({ _id: ObjectId(id) });
    return res.status(200).send("Mensagem apagada");
  } catch (err) {
    return res.status(422).send("Erro ao apagar mensagem");
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running in port: ${PORT}`));
