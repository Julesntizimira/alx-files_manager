import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    const base64Token = req.headers.authorization.split(' ')[1];
    const [email, password] = Buffer.from(base64Token, 'base64').toString('utf-8').split(':');
    if (email && password) {
      const myCollection = dbClient.client.db().collection('users');
      const user = await myCollection.findOne({ email });
      if (user) {
        if (user.password === sha1(password)) {
          const authToken = uuidv4();
          await redisClient.set(`auth_${authToken}`, (user._id).toString(), 86400);
          res.status(200).json({ token: authToken });
          return;
        }
      } else {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    res.status(401).json({ error: 'Unauthorized' });
  }

  static async getDisconnect(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (userId) {
      await redisClient.del(`auth_${token}`);
      res.status(204);
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

module.exports = AuthController;
