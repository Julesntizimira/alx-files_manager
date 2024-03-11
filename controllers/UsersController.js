import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email } = req.body;
    const { password } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!password) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }
    const myCollection = dbClient.client.db().collection('users');
    const result = await myCollection.findOne({ email });
    if (result) {
      res.status(400).json({ error: 'Already exist' });
    } else {
      const hashedPassword = sha1(password);
      myCollection.insertOne({ email, password: hashedPassword }).then((resp) => {
        res.status(201).json({ id: resp.insertedId, email });
      });
    }
  }
}

module.exports = UsersController;
