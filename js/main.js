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

	function smoothData(value, dataType) {
		smoothing = 50;
		if (dataType == "pitch") {
			smoothedPitch += (value - smoothedPitch) / smoothing;
			return smoothedPitch;
		}
		if (dataType == "yaw") {
			smoothedYaw += (value - smoothedYaw) / smoothing;
			return smoothedYaw;
		}
	}

	function radiansToDegrees(radians) {
  		return radians * (180 / Math.PI);
	}

	function generateHyperlapse() {
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
	// Whether or not the previousFrame has a steering hand
	var previousFrameHasSteeringHand = false;
	// Smoothed pitch and yaw
	var smoothedPitch;
	var smoothedYaw;

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
						var leap_pitch = null;
						var leap_yaw = null;
						if (previousFrameHasSteeringHand) {
							var smoothed_leap_pitch = smoothData(hand.pitch(), "pitch");
							var smoothed_leap_yaw = smoothData(hand.yaw(), "yaw");
							leap_pitch = radiansToDegrees(smoothed_leap_pitch);
							leap_yaw = radiansToDegrees(smoothed_leap_yaw);
						} else {
							var pitch = 0; 
							var yaw = 0;
							smoothedPitch = pitch; 
							smoothedYaw = yaw;
							leap_pitch = radiansToDegrees(pitch);
							leap_yaw = radiansToDegrees(yaw);
						}
						hyperlapse_x = scale(leap_yaw, -80, 80, -360, 360);
						hyperlapse_y = scale(leap_pitch, -70, 70, -180, 180);
						hyperlapse.position.x = hyperlapse_x;
						hyperlapse.position.y = hyperlapse_y;
						previousFrameHasSteeringHand = true;
					} 	
					if ((frame.hands.length == 1) && (hand.type != steering_hand)) {
						previousFrameHasSteeringHand = false;
					}
			    }
			} else {
				hyperlapse.position.x = 0;
				hyperlapse.position.y = 0;	
			}
  			// Store frame for motion functions
  			previousFrame = frame;
		});
	};

	hyperlapse.onFrame = function(e) {
		camera_pin.setPosition(e.point.location);
	};

	generateHyperlapse();
});