import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import Queue from 'bull';
import dbClient from './utils/db';

const fileCollection = dbClient.client.db().collection('files');
const userCollection = dbClient.client.db().collection('users');
const fileQueue = new Queue('fileQueue');
const userQueue = new Queue('userQueue');

fileQueue.process(async (job, done) => {
  console.log('Processing...');
  const { fileId } = job.data;
  const { userId } = job.data;
  console.log(fileId, userId);
  if (!fileId) {
    done(new Error('Missing fileId'));
  }
  if (!userId) {
    done(new Error('Missing userId'));
  }
  const newImage = await fileCollection
    .findOne({ _id: new ObjectId(String(fileId)), userId: new ObjectId(String(userId)) });
  if (!newImage) {
    done(new Error('File not found'));
  }
  const options = [
    { width: 500 },
    { width: 250 },
    { width: 100 },
  ];
  for (const option of options) {
    imageThumbnail(newImage.localPath, option)
      .then((thumbnailData) => {
        fs.writeFileSync(`${newImage.localPath}_${option.width}`, thumbnailData, 'base64');
      }).catch((err) => {
        done(err);
      });
  }
  done();
});

userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) {
    done(new Error('Missing userId'));
  }
  const user = await userCollection.findOne({ _id: new ObjectId(String(userId)) });
  if (!user) {
    done(new Error('User not found'));
  }
  console.log(`Welcome ${user.email}!`);
  done();
});
