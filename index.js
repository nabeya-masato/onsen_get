var parser = require('./xml-parser');
var https = require('https');
var http = require('http');
var axios = require('axios');
var fs = require('fs');
var config = require('config');
var id3 = require("node-id3");

const log4js = require('log4js')

log4js.configure({
  appenders : {
    system : {
	type : 'dateFile', 
	filename : './logs/system.log',
      	pattern: '-yyyy-MM-dd',
      	backups: 30,
      	compress: false
    },
    console: { type: 'console' }
  },
  categories : {
    default : {appenders : ['system', 'console'], level : config.config.log_level},
  }
});
const logger = log4js.getLogger('system');

try{
	var history = require('./history.json');
}catch{
	var history = [];
}

var deleteFolderRecursive = function(path) {
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

var dight2 = d => {
	let str = '0' + d;
	return str.substring(str.length-2,str.length);
}

var dight4 = d => {
	if(!Number(d))return d;
        let str = '000' + d;
        return str.substring(str.length-4,str.length);
}

var continuous_download = list => {
	let download = list.shift();
	if(!download){
		fs.writeFileSync('./history.json', JSON.stringify(history));
		logger.info('finish')
		return;
	}
	let folder = config.config.storage + '/' + download.folder;
	if (!fs.existsSync(folder)) {
		try{
	 		fs.mkdirSync(folder);
			// 出力ファイル名を指定       
			let filepath = folder+'/'+download.filename;        
			let outFile = fs.createWriteStream(filepath);
		}catch{                        
			deleteFolderRecursive(folder);
			folder = config.config.current+download.id;
			if(!fs.existsSync(folder)){
				fs.mkdirSync(folder);
			}
			// 出力ファイル名を指定                               
			let filepath = folder+'/'+download.filename;                                 
			let outFile = fs.createWriteStream(filepath);
		}
	}
	// 出力ファイル名を指定
	let filepath = folder+'/'+download.filename;
	let outFile = fs.createWriteStream(filepath);

	// ダウンロード開始
	logger.info('start: download');
	logger.debug(download);
	logger.info('save to ' + filepath)
	let req = https.get(download.url, function (res) {

    		// ダウンロードした内容をそのまま、ファイル書き出し。
	    	res.pipe(outFile);

   	 	// 終わったらファイルストリームをクローズ。
    		res.on('end', function () {
        		outFile.close();
			if(download.filename.split('.').pop()==="mp3")set_meta(download.tag,download.image,filepath);
			history.push(download.url);
			logger.info('next->');
			continuous_download(list);
    		}); 
	});
}

var downloads = [];

var set_meta = (meta,banner_image,file_path) => {
	let logo = banner_image.split('/').pop();
	if (!fs.existsSync(config.config.logo_folder)) {
		fs.mkdirSync(config.config.logo_folder);
	}
	let list = fs.readdirSync(config.config.logo_folder);
	let path = config.config.logo_folder+'/'+logo;
	let setMeta = () =>{
		meta.image.imageBuffer = fs.readFileSync(path);
		id3.write(meta,file_path);
	}
	if(!list.find(x=>x===logo)){
		let outFile = fs.createWriteStream(path);
		http.get("http://www.onsen.ag" + banner_image,function (res) {
			// ダウンロードした内容をそのまま、ファイル書き出し。
			res.pipe(outFile);
			// 終わったらファイルストリームをクローズ。
			res.on('end', function () {
				outFile.close();
				logger.info('get_logo->'+logo);
				setMeta();
			});        
		});
	}else{
		setMeta();
	}
	

}

axios.get(config.config.target).then(res=>{
	let getlist = parser.parse(res.data);
	getlist.programs.program.forEach(program=>{
		// get url
		let url = program.movie_url;
		if(!url||history.find(x=>x===url)) return;
		let folder = program.title.replace(/\:|\?|\.|"|<|>|\|/g, `_` );
		let update = program.up_date.split(' ')[0];
		// let filename = dight4(program.program_number)+'.'+url.split('.').pop();
		let filename = `${update}配信 ${program.program_number}回`+'.'+url.split('.').pop();;
		let title = `${program.title} ${program.program_number}回` + 
			isNaN(Number(program.program_number))?
				" " + update:"";
		let download = {
			id: program.attr['@id'],
			folder:  folder,
			filename: filename,
			url: url,
			number: program.program_number,
			image: program.banner_image,
			tag: {
				title:  `${program.title} ${program.program_number}回`,
				artist: program.actor_tag,
				album: program.title,
				genre: "Radio",
				TRCK: program.program_number,
				image: {
					mine: "jpeg",
					type: {
						id: 3,
						name:"front cover"
					},
					imageBuffer: null 
				}
			}
		};
		downloads.push(download);
	});
	continuous_download(downloads);
});
