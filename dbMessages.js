import mongoose from 'mongoose';

const tinderchatsSchema = mongoose.Schema({
    message: String,
    receiverId: String,
    senderId: String,
}, { timestamp: true });

export default mongoose.model('messagecontents', tinderchatsSchema)