import sha1 from 'sha1';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

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

  static async getMe(req, res) {
    const token = req.headers['X-Token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (userId) {
      const myCollection = dbClient.client.db().collection('users');
      const objectId = new ObjectID(userId);
      const user = await myCollection.findOne({ _id: objectId });
      res.status(200).json({ id: userId, email: user.email });
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

module.exports = UsersController;
