import mongoose from 'mongoose';

const UserSchema = mongoose.Schema({
    unique_id: String,
    fname:String,
    lname:String,
    email:String,
    passwordhash:String,
    profileImg: String,
    date: { type: Date, default: Date.now },
});

export default mongoose.model('userdetails', UserSchema);