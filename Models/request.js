var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;


var requestSchema = new Schema({
	description: {type: String},
	course: {type:String},
	offer: {type:Number},  // price set by student 
	sender: {type: ObjectId, ref: 'User'}
});


Request = mongoose.model('Request', requestSchema);
module.exports = Request;
