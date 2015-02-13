var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;

var userSchema = new Schema({
	name: {type:String, required: true},
	email: {type: String, unique: true, required: true},
	password: {type: String },
	studentRating: {type: Number},
	tutorRating: {type: Number},
	location:{
		xPos: {type:Number}, 
		yPos:{type:Number}
	},
	profilePic:{type:String},
	tutor: {type:Boolean},
	approved: {type:Boolean, default: false},
	studentCourses: [{type: ObjectId, ref: 'Course'}],
	tutorCourses: [{type: ObjectId, ref: 'Course'}]
});



userSchema.statics.create = function(name, email, next){
	var user = new User({name: name, email: email});
	user.save(function(err, user){
		if(err){
			console.log(err);
		}else if(user){
			next(user);
		}
	});
}

userSchema.statics.login = function(name, email, next){
	var User = this;
	 User.findOne({email:email}, function(err, user){
	 	if(err){
	 		console.log(err);
	 	}else if(!user){
	 		// create the user
	 		User.create(name, email, function(user){
	 			next(user);
	 		}); 
	 	}else{
	 		next(user);
	 	}
	 });

}



userSchema.statics.lookUp = function(name, next){
	this.findOne({name: name}, function(err, user){
		if(err){
			console.log(err);
		}else if(user){
			next(user);
		}
	});
}


userSchema.statics.removeUsers = function(next){
	this.find({}, function(err, users){
		for(var i =0; i< users.length; i++){
			var user = users[i];
			user.remove();
		}
		next();
	 });
}

userSchema.methods.updateStudentRating = function(rating, next){

}

userSchema.methods.updateTutorRating = function(rating, next){
	
}

userSchema.methods.updateLocation = function(xPos, yPos, next){

}

userSchema.methods.updateStudentCourses = function(courses, next){

}

userSchema.methods.updateTutorCourses = function(courses, next){

}

userSchema.methods.setApproved = function(){
	
}


User = mongoose.model('User', userSchema);
module.exports = User;
