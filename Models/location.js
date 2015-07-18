var mongoose = require('mongoose')
var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;


var locationSchema = new Schema({
	address: {type: String, unique: true },
	name: String,
	lat: Number,
	lon: Number
});





Location = mongoose.model('Location', locationSchema);
module.exports = Location;
