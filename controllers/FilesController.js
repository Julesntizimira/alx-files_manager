import { ObjectId } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    const fileCollection = dbClient.client.db().collection('files');
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    const owner = new ObjectId(String(userId));
    const { body } = req;
    const {
      name, type, data, parentId, isPublic,
    } = body;
    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && (type !== 'folder')) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    if (parentId) {
      const parentFile = await fileCollection.findOne({ _id: parentId });
      if (!parentFile) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (parentFile.type !== 'folder') {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }
    const fileObj = {
      name, type, data, userId: owner,
    };
    fileObj.isPublic = isPublic || false;
    fileObj.parentId = parentId || 0;
    if (type === 'folder') {
      const result = await fileCollection.insertOne(fileObj);
      res.status(201).json({
        id: result.insertedId, userId: owner, name, type, isPublic, parentId: fileObj.parentId,
      });
      return;
    }
    const path = process.env.FOLDER_PATH || '/tmp/files_manager';
    const localPath = `${path}/${uuidv4()}`;
    const fileBfuffer = Buffer.from(data, 'base64');
    fs.writeFileSync(localPath, fileBfuffer);
    fileObj.localPath = localPath;
    const resp = await fileCollection.insertOne(fileObj);
    res.status(201).json({
      id: resp.insertedId, userId: owner, name, type, isPublic, parentId: fileObj.parentId,
    });
  }
}

module.exports = FilesController;
