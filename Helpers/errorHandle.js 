exports.loginErrors = function(res,err){
	if(err.status){
		res.json(err.status, err.message);
	}else{
		console.log(err);
		res.json(500);
	}
}