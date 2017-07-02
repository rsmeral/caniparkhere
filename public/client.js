var req = new XMLHttpRequest();

function isDefined(a) {
  return typeof a !== 'undefined';
}

function handleDataError() {
  // TODO
}

function handlePositionError(err) {
  // TODO
}

function handlePositionData(pos) {
  fetchData(pos.coords);
}

function getPosition() {
  var options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };
  navigator.geolocation.getCurrentPosition(handlePositionData, handlePositionError, options);
}

function switchBackground(to) {
  document.body.className = to;
}

function switchEmoji(to) {
  emoji = document.getElementById("emoji");
  emoji.src = "img/" + to + ".png";
}

function switchState(data) {
  switchBackground(data.can.toLowerCase());
  switch(data.can) {
    case "NO":
    case "MAYBE":
      switchEmoji(data.can.toLowerCase());
      break;
    case "YES":
      if(isDefined(data.but.price)) {
        switchEmoji("yesbutprice");
      } else if(Object.keys(data.but).length > 0) {
        switchEmoji("yesbut");
      } else {
        switchEmoji("yes");
      }
  }
}

const texts_cz = {
  YES: "Jo, klidně parkuj",
  YESBUT: "Jo, zaparkuj",
  NO: "Ne, tady neparkuj",
  MAYBE: "Možná, ale neručím",
  
  BUT: "ale",
  BUT_WARN: "ale bacha",
  BECAUSE: "protože",
  
  // DONTKNOW because
  unsupportedRegion: "to tu neznám",
  lowAccuracy: "není tě moc vidět mezi těma barákama",
  noParkingData: "nevím jak se tu parkuje",
  noCleaningData: "nevím kdy to tu čistěj",
  
  // NO because
  cleaningToday: "se tu dnes bude čistit",
  
  // but-warning
  cleaningSoon: function(data) {
    var daysPhrase = "";
    switch(data.but.cleaningSoon) {
      case 1:
        daysPhrase = texts_cz.TOMORROW;
        break;
      case 2:
      case 3:
      case 4:
        daysPhrase = "o " + String(data.but.cleaningSoon) + " " + texts_cz.DEN_2_4; 
        break;
      default: 
        daysPhrase = "o " + String(data.but.cleaningSoon) + " " + texts_cz.DEN_5_PLUS; 
    }
    return "{daysPhrase} se tu bude čistit".replace("{daysPhrase}", daysPhrase);
  },
  
  // but
  timeLimit: function(data) {
    var timeLimitPhrase = "";
    switch(data.but.timeLimit) {
      case 1:
        timeLimitPhrase = String(data.but.timeLimit) + " " + texts_cz.HOD_ONE;
        break;
      case 2:
      case 3:
      case 4:
        timeLimitPhrase = String(data.but.timeLimit) + " " + texts_cz.HOD_2_4; 
        break;
      default: 
        timeLimitPhrase = String(data.but.timeLimit) + " " + texts_cz.HOD_5_PLUS; 
    }
    return "jen {timeLimitPhrase}".replace("{timeLimitPhrase}", timeLimitPhrase);
  },
  
  price: function(data) {
    return "vyplázneš {pricePhrase} Kaček za hodinu".replace("{pricePhrase}", data.but.price);
  },

  TOMORROW: "zítra",
  
  DEN_ONE: "den",
  DEN_2_4: "dny",
  DEN_5_PLUS: "dní",
  
  HOD_ONE: "hodinu",
  HOD_2_4: "hodiny",
  HOD_5_PLUS: "hodin"
} 

function clauseConjunction(clauses) {
  if(clauses.length == 1) return clauses[0];
  const last = clauses.pop();
  return clauses.join(", ") + ", a " + last;
}

function interpolateClause(clauseId, data) {
  const clauseRef = texts_cz[clauseId];
  return (typeof clauseRef === "function") ? clauseRef(data) : clauseRef;
}

function setText(data) {
  var result = "";
  result += texts_cz[data.can];
  switch(data.can) {
    case "NO":
    case "MAYBE":
      if(data.because.length > 0) {
        result += ", ";
        result += texts_cz.BECAUSE;
        result += " ";
        const becauseClause = clauseConjunction(
          ["unsupportedRegion", 
          "lowAccuracy", 
          "noParkingData", 
          "noCleaningData", 
          "cleaningToday"].filter((e) => 
            data.because.includes(e)
          ).map((e) =>
            interpolateClause(e, data)
          )
        );
        result += becauseClause;
      }
      break;
    case "YES":
      if(Object.keys(data.but).length > 0) {
        result += ", ";
        if(isDefined(data.but.cleaningSoon)) {
          result += texts_cz.BUT_WARN + ", ";
        } else {
          result += texts_cz.BUT;
        }
        result += " ";
        const butClause = clauseConjunction(
          ["cleaningSoon", 
          "timeLimit", 
          "price"].filter((e) => 
            Object.keys(data.but).includes(e)
          ).map((e) =>
            interpolateClause(e, data)
          )
        );
        result += butClause;
      }
  }
  result += ".";
  
  document.getElementById("text").textContent = result;
}

function handleData() {
  if (req.status >= 200 && req.status < 400) {
    var data = JSON.parse(req.responseText);
    switchState(data);
    setText(data);
    console.log(data);
  } else handleError();
}

function fetchData(coords) {
  req.open('POST', '/canpark', true);

  req.onload = handleData;
  req.onerror = handleDataError;
  req.setRequestHeader("Content-Type", "application/json");
  req.send(JSON.stringify({lat: coords.latitude, lon: coords.longitude, acc: coords.accuracy, pop: []}));
}

window.onload = getPosition;
