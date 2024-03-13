import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const userQueue = new Queue('userQueue');

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
      const resp = await myCollection.insertOne({ email, password: hashedPassword });
      res.status(201).json({ id: resp.insertedId, email });
      await userQueue.add({ userId: resp.insertedId.toString() });
    }
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (userId) {
      const myCollection = dbClient.client.db().collection('users');
      const objectId = new ObjectId(String(userId));
      const user = await myCollection.findOne({ _id: objectId });
      res.status(200).json({ id: userId, email: user.email });
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

module.exports = UsersController;
