import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { body } = req;
    if (!body.email) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!body.password) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }
    const client = await dbClient.client;
    const user = await client.db().collection('users').findOne({ email: body.email });
    if (user) {
      res.status(400).json({ error: 'Already exist' });
      return;
    }
    const hashedPassword = sha1(body.password);
    const result = await client.db().collection('users')
      .insertOne({ email: body.email, password: hashedPassword });
    res.status(201).json({ _id: result.insertedId, email: body.email });
  }
}

module.exports = UsersController;
