$(document).ready(function(){

	var start_point = new google.maps.LatLng(-28.81823,29.69651);
	var end_point = new google.maps.LatLng(-28.78515,29.680820000000004);
	var lookat_point = new google.maps.LatLng(-28.8003314927684, 29.67021392578124);
	var map, directions_renderer, directions_service, streetview_service, geocoder;
	var start_pin, end_pin, pivot_pin, camera_pin;
	var _elevation = 0;
	var _route_markers = [];

	if (window.location.hash) {
		parts = window.location.hash.substr( 1 ).split( ',' );
		start_point = new google.maps.LatLng(parts[0], parts[1]);
		lookat_point = new google.maps.LatLng(parts[2], parts[3]);
		end_point = new google.maps.LatLng(parts[4], parts[5]);
		_elevation = parts[6] || 0;
	} 

	function changeHash() {
		window.location.hash = start_pin.getPosition().lat() + ',' + 
		start_pin.getPosition().lng() + ',' + 
		pivot_pin.getPosition().lat() + ',' + 
		pivot_pin.getPosition().lng() + ',' + 
		end_pin.getPosition().lat() + ',' + 
		end_pin.getPosition().lng() + ',' + 
		_elevation;
	}

	function scale(value, leap_min, leap_max, hyperlapse_min, hyperlapse_max) {
		return (((hyperlapse_max - hyperlapse_min) * (value - leap_min)) / (leap_max - leap_min)) + hyperlapse_min;
	}

	function radiansToDegrees(radians) {
  		return radians * (180 / Math.PI);
	}

	var mapOpt = { 
		center: start_point,
		zoom: 13,
		streetViewControl: false,
		panControl: false
	};

	map = new google.maps.Map(document.getElementById("map"), mapOpt);
	geocoder = new google.maps.Geocoder();

	directions_service = new google.maps.DirectionsService();
	directions_renderer = new google.maps.DirectionsRenderer({
		draggable: false, 
		markerOptions: { 
			visible: false
		}
	});
	directions_renderer.setMap(map);

	camera_pin = new google.maps.Marker({
		position: start_point,
		map: map,
		icon: 'img/heading.png'
	});

	start_pin = new google.maps.Marker({
		position: start_point,
		draggable: false,
		map: map
	});

	end_pin = new google.maps.Marker({
		position: end_point,
		draggable: false,
		map: map
	});

	pivot_pin = new google.maps.Marker({
		position: lookat_point,
		draggable: false,
		map: map
	});
	// Set pivot pin to be invisible since we don't need it for our purposes
	pivot_pin.setMap(null);

	/* Hyperlapse and Leap */
	var pano = document.getElementById('pano');
	var px, py;
	var onPointerDownPointerX = 0;
	var onPointerDownPointerY = 0;

	var hyperlapse = new Hyperlapse(pano, {
		lookat: lookat_point,
		fov: 80,
		millis: 90,
		width: window.innerWidth,
		height: window.innerHeight,
		zoom: 2,
		use_lookat: false,
		distance_between_points: 5,
		max_points: 100,
		elevation: _elevation
	});
	    
	hyperlapse.onError = function(e) {
		console.log( "ERROR: " + e.message );
	};

	hyperlapse.onRouteProgress = function(e) {
		_route_markers.push( new google.maps.Marker({
			position: e.point.location,
			draggable: false,
			icon: "img/dot_marker.png",
			map: map
			})
		);
	};

	hyperlapse.onRouteComplete = function(e) {
		console.log( "Number of Points: "+ hyperlapse.length() );
		hyperlapse.load();
	};

	hyperlapse.onLoadProgress = function(e) {
		console.log( "Loading: "+ (e.position+1) +" of "+ hyperlapse.length() );
	};

	// Store frame for motion functions
	var previousFrame = null;
	// Setup Leap loop with frame callback function
	var controllerOptions = {enableGestures: true};
	// State of moving
	var is_moving = false;
	// Direction of moving
	var moving_forward = true; 
	// Hand roles
	var steering_hand;
	var velocity_hand;

	hyperlapse.onLoadComplete = function(e) {
		console.log( "Hyperlapse finished loading route.");
		hyperlapse.next();
		Leap.loop(controllerOptions, function(frame) {
  			if (frame.hands.length > 0) {
			    for (var i = 0; i < frame.hands.length; i++) {
					var hand = frame.hands[i];
					if (!velocity_hand) {
						velocity_hand = hand.type;
						console.log("The velocity hand is set to be the " + velocity_hand.toUpperCase() + " hand.");
					}
					if (!steering_hand && (velocity_hand != hand.type)) {
						steering_hand = hand.type;
						console.log("The steering hand is set to be the " + steering_hand.toUpperCase() + " hand.");
					}
					if (velocity_hand == hand.type) {
						if (frame.hands.length == 1) {
							hyperlapse.position.x = 0;
							hyperlapse.position.y = 0;		
						}
						if (hand.grabStrength == 1 && is_moving) {
							hyperlapse.pause();
							is_moving = false;
							console.log("PAUSE. Not driving...");
						} 
						if (hand.grabStrength == 0 && !is_moving) {
							hyperlapse.play();
							is_moving = true;
							console.log("PLAY. Driving...");
						}
						leap_palmPosition_y = hand.palmPosition[1];
						hyperlapse_millis = scale(leap_palmPosition_y, 20, 500, 10, 250);
						hyperlapse.millis = hyperlapse_millis;
					} 						
					if (steering_hand == hand.type) {
						leap_pitch = radiansToDegrees(hand.pitch());
						leap_yaw = radiansToDegrees(hand.yaw());
						hyperlapse_x = scale(leap_yaw, -80, 80, -360, 360);
						hyperlapse_y = scale(leap_pitch, -70, 70, -180, 180);
						hyperlapse.position.x = hyperlapse_x;
						hyperlapse.position.y = hyperlapse_y;
					} 	
			    }
			} else {
				hyperlapse.position.x = 0;
				hyperlapse.position.y = 0;	
			}
  			// Store frame for motion functions
  			previousFrame = frame;

  			// when smoothing, time between two frames is frame.timestamp - previousFrame.timestamp
		});
	};

	hyperlapse.onFrame = function(e) {
		camera_pin.setPosition(e.point.location);
	};

	/* Dat GUI */
	var gui = new dat.GUI();

	var o = {
		distance_between_points:10, 
		max_points:100, 
		fov:80, 
		elevation:Math.floor(_elevation), 
		tilt:0, 
		millis:90, 
		offset_x:0,
		offset_y:0,
		offset_z:0,
		position_x:0,
		position_y:0,
		screen_width: window.innerWidth,
		screen_height: window.innerHeight,
		generate: function() {
			console.log( "Generating route..." );
			var marker;
			while(_route_markers.length > 0) {
				marker = _route_markers.pop();
				marker.setMap(null);
			}
			request = {
				origin: start_point, 
				destination: end_point, 
				travelMode: google.maps.DirectionsTravelMode.DRIVING
			};
			directions_service.route(request, function(response, status) {
				if (status == google.maps.DirectionsStatus.OK) {
			        var bounds = response.routes[0].bounds;
			        map.fitBounds(bounds);
			        map.setCenter(bounds.getCenter()); 
			        directions_renderer.setDirections(response);  
					hyperlapse.generate({route: response});
				} else {
					console.log(status);
				}
			})
		}
	};

	var scn = gui.addFolder('screen');
	scn.add(o, 'screen_width', window.innerHeight).listen();
	scn.add(o, 'screen_height', window.innerHeight).listen();

	var parameters = gui.addFolder('parameters');

	var millis_control = parameters.add(o, 'millis', 10, 250);
	millis_control.onChange(function(value) {
		hyperlapse.millis = value;
	});

	var position_x_control = parameters.add(o, 'position_x', -360, 360).listen();
	position_x_control.onChange(function(value) {
		hyperlapse.position.x = value;
	});

	var position_y_control = parameters.add(o, 'position_y', -180, 180).listen();
	position_y_control.onChange(function(value) {
		hyperlapse.position.y = value;
	});

	parameters.open();
	
	var play_controls = gui.addFolder('play controls');
	play_controls.add(hyperlapse, 'play');
	play_controls.add(hyperlapse, 'pause');
	play_controls.add(hyperlapse, 'next');
	play_controls.add(hyperlapse, 'prev');
	play_controls.open();

	window.addEventListener('resize', function(){
		hyperlapse.setSize(window.innerWidth, window.innerHeight);
		o.screen_width = window.innerWidth;
		o.screen_height = window.innerHeight;
	}, false);

	o.generate();

});