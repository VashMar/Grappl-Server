var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;

var courseSchema = new Schema({
	recipient: {type: ObjectId, ref: 'User'},
	sender: {type: ObjectId, ref: 'User'},
	content: {type: String}
});




Message = mongoose.model('Message', messageSchema);
module.exports = Message;
