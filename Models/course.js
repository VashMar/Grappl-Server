var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;


var courseSchema = new Schema({
	name: {type:String, required: true, unique: true},
	tutors: [{type: ObjectId, ref: 'User'}],
	tags: {type:String}
});

courseSchema.statics.getAll = function(next){
	this.find({}).populate('tutors').exec(function(err, courses){
		if(err){
			console.log(err);
		}else{
			next(courses);
		}
	});
}


// adds a tutor to the given course
courseSchema.methods.addTutor = function(user){
	for(var i = 0; i < this.tutors.length; i++){
		if(!tutorExists(this.tutors, user)){
			console.log("Saving tutor to course..");
			this.tutors.push(user);
		}
	}
}


// removes a tutor from the given course 
courseSchema.methods.removeTutor = function(user){
	var tutors = this.tutors; 
	for(var i =0; i < tutors.length; i++){
		if(tutors[i]._id == user._id){
			tutors[i].setUnavailable();
			console.log("Removing tutor from course..");
			tutors.splice(i,1);  // removes tutor from list 
		}
	}
}


// returns true if tutor exists in list of tutors
function tutorExists(tutors, currTutor){
	for( var i = 0; i < tutors.length; i++){
		if(tutors[i]._id === currTutor._id){
			console.log("Tutor already exists");
			return true;
		}
		if(i == tutors.length-1){
			return false; 
		}
	}
}




Course = mongoose.model('Course', courseSchema);
module.exports = Course;
