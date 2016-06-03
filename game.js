(function ()
{
  // define variables
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  var player, score, stop, ticker;
  var ground = [], spike = [], enemies = [], environment = [];
  var audio = new Audio('audio/background.mp3');
  var jumpSound = new Audio('audio/jump.mp3');
  // platform variables
  var platformHeight, platformLength, gapLength;
  var platformWidth = 32;
  var platformBase = canvas.height - platformWidth;
  var platformSpacer = 64;


  function rand(low, high)
  {
    return Math.floor( Math.random() * (high - low + 1) + low );
  }


  function bound(num, low, high)
  {
    return Math.max( Math.min(num, high), low);
  }

  var assetLoader = (function()
  {
    // images dictionary
    this.imgs        = {
      'bg'            : 'imgs/bg.png',
      'sky'           : 'imgs/sky.png',
      'sand'         : 'imgs/sand.png',
      'avatar_normal' : 'imgs/normal_walk.png',
      'spike'         : 'imgs/spike.png',
      'sand1'         : 'imgs/sandBigBlock1.png',
      'sand2'         : 'imgs/sandBigBlock2.png',
      'bridge'        : 'imgs/bridge.png',
      'plant'         : 'imgs/plant.png',
      'cactus'        : 'imgs/cactus.png',
      'enemy'         : 'imgs/enemy.png'
    };


    var assetsLoaded = 0;
    var numImgs      = Object.keys(this.imgs).length;
    this.totalAssest = numImgs;


    function assetLoaded(dic, name)
    {
      if (this[dic][name].status !== 'loading')
      {
        return;
      }

      this[dic][name].status = 'loaded';
      assetsLoaded++;

      if (assetsLoaded === this.totalAssest && typeof this.finished === 'function')
      {
        this.finished();
      }
    }
    this.downloadAll = function()
    {
      var _this = this;
      var src;

      // load images
      for (var img in this.imgs)
      {
        if (this.imgs.hasOwnProperty(img))
        {
          src = this.imgs[img];


          (function(_this, img)
          {
            _this.imgs[img] = new Image();
            _this.imgs[img].status = 'loading';
            _this.imgs[img].name = img;
            _this.imgs[img].onload = function() { assetLoaded.call(_this, 'imgs', img) };
            _this.imgs[img].src = src;
          })(_this, img);
        }
      }
    }

    return{
      imgs: this.imgs,
      totalAssest: this.totalAssest,
      downloadAll: this.downloadAll
    };
  })();

  assetLoader.finished = function()
  {
    startGame();
  }

  function SpriteSheet(path, frameWidth, frameHeight)
  {
    this.image = new Image();
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;

    var self = this;
    this.image.onload = function() {
      self.framesPerRow = Math.floor(self.image.width / self.frameWidth);
    };

    this.image.src = path;
  }


  function Animation(spritesheet, frameSpeed, startFrame, endFrame) {

    var animationSequence = [];
    var currentFrame = 0;
    var counter = 0;


    for (var frameNumber = startFrame; frameNumber <= endFrame; frameNumber++)
      animationSequence.push(frameNumber);

    this.update = function()
    {
      if (counter == (frameSpeed - 1))
        currentFrame = (currentFrame + 1) % animationSequence.length;

      counter = (counter + 1) % frameSpeed;
    };


    this.draw = function(x, y)
    {
      var row = Math.floor(animationSequence[currentFrame] / spritesheet.framesPerRow);
      var col = Math.floor(animationSequence[currentFrame] % spritesheet.framesPerRow);

      ctx.drawImage(
        spritesheet.image,
        col * spritesheet.frameWidth, row * spritesheet.frameHeight,
        spritesheet.frameWidth, spritesheet.frameHeight,
        x, y,
        spritesheet.frameWidth, spritesheet.frameHeight);
    };
  }

  /**
   * Create a moving background
   */
  var background = (function()
  {
    var sky   = {};
    this.draw = function()
    {
      ctx.drawImage(assetLoader.imgs.bg, 0, 0);
      sky.x -= sky.speed;
      ctx.drawImage(assetLoader.imgs.sky, sky.x, sky.y);
      ctx.drawImage(assetLoader.imgs.sky, sky.x + canvas.width, sky.y);

      // If the image scrolled off the screen, reset
      if (sky.x + assetLoader.imgs.sky.width <= 0)
        sky.x = 0;

    };

    /**
     * Reset background to zero
     */
    this.reset = function()
    {
      sky.x = 0;
      sky.y = 0;
      sky.speed = 0.2;
    }

    return {
      draw: this.draw,
      reset: this.reset
    };
  })();

  /**
   * A vector for 2d space.
   * @param {integer} x - Center x coordinate.
   * @param {integer} y - Center y coordinate.
   * @param {integer} dx - Change in x.
   * @param {integer} dy - Change in y.
   */
  function Vector(x, y, dx, dy)
  {
    // position
    this.x = x || 0;
    this.y = y || 0;
    // direction
    this.dx = dx || 0;
    this.dy = dy || 0;
  }

  Vector.prototype.advance = function()
  {
    this.x += this.dx;
    this.y += this.dy;
  };

  Vector.prototype.minDist = function(vec)
  {
    //vector variables
    var minDist = Infinity;
    var max     = Math.max( Math.abs(this.dx), Math.abs(this.dy),
                            Math.abs(vec.dx ), Math.abs(vec.dy ) );
    var slice   = 1 / max;
    var x, y, distSquared;
    var vec1 = {}, vec2 = {};

    vec1.x = this.x + this.width/2;
    vec1.y = this.y + this.height/2;
    vec2.x = vec.x + vec.width/2;
    vec2.y = vec.y + vec.height/2;
    for (var percent = 0; percent < 1; percent += slice) {
      x = (vec1.x + this.dx * percent) - (vec2.x + vec.dx * percent);
      y = (vec1.y + this.dy * percent) - (vec2.y + vec.dy * percent);
      distSquared = x * x + y * y;

      minDist = Math.min(minDist, distSquared);
    }

    return Math.sqrt(minDist);
  };

  /**
   * The player
   */
  var player = (function(player)
  {
    player.width     = 60;
    player.height    = 96;
    player.speed     = 6;

    // jumping
    player.gravity   = 1;
    player.dy        = 0;
    player.jumpDy    = -10;
    player.isFalling = false;
    player.isJumping = false;

    // spritesheets
    player.sheet     = new SpriteSheet('imgs/normal_walk.png', player.width, player.height);
    player.walkAnim  = new Animation(player.sheet, 4, 0, 6);
    player.jumpAnim  = new Animation(player.sheet, 4, 4, 8);
    player.fallAnim  = new Animation(player.sheet, 4, 4, 8);
    player.anim      = player.walkAnim;

    Vector.call(player, 0, 0, 0, player.dy);

    var jumpCounter = 0;
    player.update = function()
    {

      // jump if not currently jumping or falling
      if (KEY_STATUS.space && player.dy === 0 && !player.isJumping)
      {
        player.isJumping = true;
        player.dy = player.jumpDy;
        jumpCounter = 12;
        jumpSound.play();
      }

      // jump higher if the space bar is continually pressed
      if (KEY_STATUS.space && jumpCounter) {
        player.dy = player.jumpDy;
      }

      jumpCounter = Math.max(jumpCounter-1, 0);

      this.advance();

      if (player.isFalling || player.isJumping)
      {
        player.dy += player.gravity;
      }

      if (player.dy > 0)
      {
        player.anim = player.fallAnim;
      }

      else if (player.dy < 0)
      {
        player.anim = player.jumpAnim;
      }
      else
      {
        player.anim = player.walkAnim;
      }

      player.anim.update();
    };

    player.draw = function()
    {
      player.anim.draw(player.x, player.y);
    };

    player.reset = function()
    {
      player.x = 64;
      player.y = 250;
    };

    return player;
  })(Object.create(Vector.prototype));

  //function to draw sprites not from spritesheet
  function Sprite(x, y, type)
  {
    this.x      = x;
    this.y      = y;
    this.width  = platformWidth;
    this.height = platformWidth;
    this.type   = type;
    Vector.call(this, x, y, 0, 0);


    this.update = function()
    {
      this.dx = -player.speed;
      this.advance();
    };

    /**
     * Draw the sprite at it's current position
     */
    this.draw = function()
    {
      ctx.save();
      ctx.translate(0.5,0.5);
      ctx.drawImage(assetLoader.imgs[this.type], this.x, this.y);
      ctx.restore();
    };
  }
  Sprite.prototype = Object.create(Vector.prototype);

  //to make sure platforms change and are random
  function getType()
  {
    var type;
    switch (platformHeight)
    {
      case 0:
      case 1:
        type = Math.random() > 0.5 ? 'sand1' : 'sand2';
        break;
      case 2:
        type = 'sand';
        break;
      case 3:
        type = 'bridge';
        break;

    }

    if (platformLength === 1 && platformHeight < 3 && rand(0, 3) === 0)
    {
      type = 'sand';
    }

    return type;
  }


  function updateGround()
  {
    player.isFalling = true;
    for (var i = 0; i < ground.length; i++) {
      ground[i].update();
      ground[i].draw();

      var angle;
      if (player.minDist(ground[i]) <= player.height/2 + platformWidth/2 &&
          (angle = Math.atan2(player.y - ground[i].y, player.x - ground[i].x) * 180/Math.PI) > -130 &&
          angle < -50)
      {
        player.isJumping = false;
        player.isFalling = false;
        player.y = ground[i].y - player.height + 5;
        player.dy = 0;
      }
    }

    // remove ground that have gone off screen
    if (ground[0] && ground[0].x < -platformWidth)
    {
      ground.splice(0, 1);
    }
  }

  function updateSpike()
  {
    for (var i = 0; i < spike.length; i++)
    {
      spike[i].update();
      spike[i].draw();
    }

    // remove spike that has gone off screen
    if (spike[0] && spike[0].x < -platformWidth)
    {
      var w = spike.splice(0, 1)[0];
      w.x = spike[spike.length-1].x + platformWidth;
      spike.push(w);
    }
  }

  function updateEnvironment()
  {
    for (var i = 0; i < environment.length; i++)
    {
      environment[i].update();
      environment[i].draw();
    }
    // remove environment that have gone off screen
    if (environment[0] && environment[0].x < -platformWidth)
    {
      environment.splice(0, 1);
    }
  }

  function updateEnemies()
  {
    for (var i = 0; i < enemies.length; i++)
    {
      enemies[i].update();
      enemies[i].draw();

      // collision detection
      if (player.minDist(enemies[i]) <= player.width - platformWidth/2)
      {
        gameOver();
      }
    }

    // remove enemies that have gone off screen
    if (enemies[0] && enemies[0].x < -platformWidth)
    {
      enemies.splice(0, 1);
    }
  }

  function updatePlayer()
  {
    player.update();
    player.draw();

    // second collision detection
    if (player.y + player.height >= canvas.height)
    {
      gameOver();
    }
  }


  function spawnSprites()
  {

    score++;


    if (gapLength > 0)
    {
      gapLength--;
    }

    else if (platformLength > 0)
    {
      var type = getType();

      ground.push(new Sprite(
        canvas.width + platformWidth % player.speed,
        platformBase - platformHeight * platformSpacer,
        type
      ));
      platformLength--;

      spawnEnvironmentSprites();
      spawnEnemySprites();
    }

    else
    {
      gapLength = rand(player.speed - 2, player.speed);
      platformHeight = bound(rand(0, platformHeight + rand(0, 2)), 0, 4);
      platformLength = rand(Math.floor(player.speed/2), player.speed * 4);
    }
  }


  function spawnEnvironmentSprites()
  {
    if (score > 40 && rand(0, 20) === 0 && platformHeight < 3)
    {
      if (Math.random() > 0.5)
      {
        environment.push(new Sprite(
          canvas.width + platformWidth % player.speed,
          platformBase - platformHeight * platformSpacer - platformWidth,
          'plant'
        ));
      }
    }
  }


  function spawnEnemySprites()
  {
    if (score > 100 && Math.random() > 0.96 && enemies.length < 3 && platformLength > 5 &&
        (enemies.length ? canvas.width - enemies[enemies.length-1].x >= platformWidth * 3 ||
         canvas.width - enemies[enemies.length-1].x < platformWidth : true)) {
      enemies.push(new Sprite(
        canvas.width + platformWidth % player.speed,
        platformBase - platformHeight * platformSpacer - platformWidth,
        Math.random() > 0.5 ? 'cactus' : 'enemy'
      ));
    }
  }

  function animate()
  {
    if (!stop)
    {
      requestAnimFrame( animate );
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      background.draw();

      // update sprites and location
      updateSpike();
      updateEnvironment();
      updatePlayer();
      updateGround();
      updateEnemies();
      ctx.fillText('Score: ' + score + 'm', canvas.width - 140, 30);

      if (ticker % Math.floor(platformWidth / player.speed) === 0)
      {
        spawnSprites();
      }

      if (ticker > (Math.floor(platformWidth / player.speed) * player.speed * 20) && player.dy !== 0)
      {
        player.speed = bound(++player.speed, 0, 15);
        player.walkAnim.frameSpeed = Math.floor(platformWidth / player.speed) - 1;

        ticker = 0;
        //to make sure the gap's dont get to crazy has speed increases
        if (gapLength === 0)
        {
          var type = getType();
          ground.push(new Sprite(
            canvas.width + platformWidth % player.speed,
            platformBase - platformHeight * platformSpacer,
            type
          ));
          platformLength--;
        }
      }
      ticker++;
    }
  }

  /**
   * Keep track of the spacebar events
   */
  var KEY_CODES = {32: 'space'};
  var KEY_STATUS = {};
  for (var code in KEY_CODES) {
    if (KEY_CODES.hasOwnProperty(code))
    {
       KEY_STATUS[KEY_CODES[code]] = false;
    }
  }
  document.onkeydown = function(e)
  {
    var keyCode = (e.keyCode) ? e.keyCode : e.charCode;
    if (KEY_CODES[keyCode])
    {
      e.preventDefault();
      KEY_STATUS[KEY_CODES[keyCode]] = true;
    }
  };
  document.onkeyup = function(e)
  {
    var keyCode = (e.keyCode) ? e.keyCode : e.charCode;
    if (KEY_CODES[keyCode])
    {
      e.preventDefault();
      KEY_STATUS[KEY_CODES[keyCode]] = false;
    }
  };

  var requestAnimFrame = (function()
  {
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function(callback, element){
              window.setTimeout(callback, 1000 / 60);
            };
  })();
  var startGameCounter = 0;
  /**
   * Starts Game and resets all
   */
  function startGame()
  {
    document.getElementById('game-over').style.display = 'none';
    if(startGameCounter = 0)
    {
    
    }


    ground = [];
    spike = [];
    environment = [];
    enemies = [];
    player.reset();
    ticker = 0;
    stop = false;
    score = 0;
    platformHeight = 2;
    platformLength = 15;
    gapLength = 0;

    ctx.font = '16px arial, arial';

    for (var i = 0; i < 30; i++)
    {
      ground.push(new Sprite(i * (platformWidth-3), platformBase - platformHeight * platformSpacer, 'sand'));
    }

    for (i = 0; i < canvas.width / 32 + 2; i++)
    {
      spike.push(new Sprite(i * platformWidth, platformBase, 'spike'));
    }

    background.reset();

    animate();
    audio.play();
    }


  /**
   * End the game and ask to restart
   */
  function gameOver()
  {
    stop = true;
    document.getElementById('game-over').style.display = 'block';
  }
  document.getElementById('restart').addEventListener('click', startGame);
  assetLoader.downloadAll();
})();
