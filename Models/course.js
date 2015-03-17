var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;


var courseSchema = new Schema({
	name: {type:String, required: true},
	tutors: [{type: ObjectId, ref: 'User'}]
});

// courseSchema.methods.findTutors = function(class){
// 	this.find({name: class}, function(err,course){
// 		if(course){
// 			var tutors = course.tutors;

// 		}else if(err){

// 		}
// 	});
// }
 

courseSchema.statics.getAll = function(next){
	this.find({}).populate('tutors').exec(function(err, courses){
		if(err){
			console.log(err);
		}else{
			next(courses);
		}
	});
}

Course = mongoose.model('Course', courseSchema);
module.exports = Course;
