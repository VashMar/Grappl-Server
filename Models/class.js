var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;


var courseSchema = new Schema({
	name: {type:String, required: true},
	tutors: {type: ObjectId, ref: 'User'}
});



Course = mongoose.model('Course', courseSchema);
module.exports = Course;
