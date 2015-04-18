exports.loginErrors = function(res,err){
	if(err.status){
		res.json(err.status, err.message);
	}else{
		console.log(err);
		res.json(500);
	}
}



exports.signupErrors = function(res,err){
	console.log("signup error");
	res.json(400);
}