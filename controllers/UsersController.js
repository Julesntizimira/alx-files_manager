import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { body } = req;
    if (!body.email) {
      return res.status(400).send({ error: 'Missing email' });
    }
    if (!body.password) {
      return res.status(400).send({ error: 'Missing password' });
    }
    const client = await dbClient.client;
    const user = await client.db().collection('users').findOne({ email: body.email });
    if (user) {
      return res.status(400).send({ error: 'Already exist' });
    }
    const hashedPassword = sha1(body.password);
    const result = await client.db().collection('users')
      .insertOne({ email: body.email, password: hashedPassword });
    return res.status(201).send({ _id: result.insertedId, email: body.email });
  }
}

module.exports = UsersController;
