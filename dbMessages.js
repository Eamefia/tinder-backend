import mongoose from 'mongoose';

const tinderchatsSchema = mongoose.Schema({
    message: String,
    receiverId: String,
    senderId: String,
    username: String,
    profile: String,
}, { timestamp: true });

export default mongoose.model('messagecontents', tinderchatsSchema)