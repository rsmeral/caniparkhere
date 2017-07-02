const turf = require("turf");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const joda = require('js-joda').use(require('js-joda-timezone'));

// trilean logic
const MAYBE = "MAYBE";
const NO = "NO";
const YES = "YES";

// language parsing
const DOW_CZ = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const FREE_CZ = 'zdarma';

// configuration
const ACC_THRESH = 40;// meters
const CLEANING_DAYS = 7;// days
const SUPPORTED_REGIONS = ["Praha 3", "Praha 5", "Praha 6", "Praha 8"];
const TZ = joda.ZoneId.of('Europe/Prague');
const TIME_LIMITS = {
  "RES": 3,
  "MIX": 24,
  "VIS": 3
};

// load data
const cleaningSummer = JSON.parse(fs.readFileSync("data/DOP_TSK_LU_terminy_p.json", {encoding: "utf-8"}));
const zones = JSON.parse(fs.readFileSync("data/DOP_ZPS_ZonyStani_p.json", {encoding: "utf-8"}));
const cityRegions = JSON.parse(fs.readFileSync("data/TMMESTSKECASTI_P.json", {encoding: "utf-8"}));

// find polygons in an array that overlap the current point
function findFeatures(point, polygons) {
  return polygons.find((e) => turf.inside(point, e));
}

function getCurrentRegion(pnt) {
  return findFeatures(pnt, cityRegions.features);
}

function getCleaningZone(pnt) {
  return findFeatures(pnt, cleaningSummer.features);
}

function getParkingZone(pnt) {
  return findFeatures(pnt, zones.features);
}

// "DAY": "10.04.2017, 15.09.2017",
// returns [[10,4,2017],[15,9,2017]]
function parseCleaningDays(feature) {
  return feature.properties.DAY.split(",").map((e) => e.trim().split(".").map((x) => Number(x)));
}

function isCleaningDay(feature) {
  const days = parseCleaningDays(feature);
  const now = joda.ZonedDateTime.now(TZ);
  return days.map((d) =>
    now.dayOfMonth() === d[0] && 
    now.monthValue() === d[1] && 
    now.year() === d[2]
  ).reduce((a,v) => a || v, false);
}

function isCleaningDaySoon(feature) {
  const days = parseCleaningDays(feature);
  const now = joda.ZonedDateTime.now(TZ);
  const upcoming = days.find((d)=> {
    const nd = joda.Period.between(now.toLocalDate(), joda.ZonedDateTime.of8(d[2],d[1],d[0],0,0,0,0,TZ).toLocalDate()).days();
    return nd > 0 && nd < CLEANING_DAYS;
  });
  return (typeof upcoming === "undefined") ? false : upcoming;
}

function isRegionSupported(region) {
  return SUPPORTED_REGIONS.includes(region.properties.NAZEV_1);
}

// takes TARIFTEXT, e.g. "TARIFTEXT": "Po-Pá: 08:00-19:59 20 Kč/hod, 20:00-05:59 20 Kč/hod; So-Ne: zdarma",
/* returns
[ { days: [0, 4], from: [8, 0], to: [19, 59], price: 20},
  { days: [0, 4], from: [20, 0], to: [23, 59], price: 20},
  { days: [0, 4], from: [0, 0], to: [5, 59], price: 20} ]
*/
function parseTariffText(feature) {
  if(!feature.properties.hasOwnProperty("TARIFTEXT")) {
    return [];
  }
  return feature.properties.TARIFTEXT.split(";").reduce((a,v) => {
    const d1 = v.trim().slice(0,2);
    const d2 = v.trim().slice(3,5);
    const days = [DOW_CZ.indexOf(d1), DOW_CZ.indexOf(d2)];
    const tariffs = v.trim().slice(7).split(",");
    tariffs.forEach(function(e) {
      const tariff = e.trim();
      if(tariff !== FREE_CZ) {
        const re = /(\d\d):(\d\d)-(\d\d):(\d\d)\s(\d+)\sKč\/hod/g;
        const m = re.exec(tariff);
        if(Number(m[1])<Number(m[3])) {
          a.push({
            days: days,
            from: [Number(m[1]), Number(m[2])],
            to: [Number(m[3]), Number(m[4])],
            price: Number(m[5])
          });
        } else {
          a.push({
            days: days,
            from: [Number(m[1]), Number(m[2])],
            to: [23, 59],
            price: Number(m[5])
          });
          a.push({
            days: days,
            from: [0, 0],
            to: [Number(m[3]), Number(m[4])],
            price: Number(m[5])
          });
        }
      }
    });
    return a;
  }, []);
}

function getPrice(feature) {
  const tariff = parseTariffText(feature);
  const now = joda.ZonedDateTime.now(TZ);
  const d = now.dayOfWeek().ordinal();
  const h = now.hour();
  const m = now.minute();
  const policy = tariff.find((e)=>
    d >= e.days[0] && d <= e.days[1] &&
    h >= e.from[0] && h <= e.to[0] &&
    m >= e.from[1] && m <= e.to[1]
  );
  return (typeof policy === "undefined")? 0 : policy.price;
} 

function getZoneCategory(feature) {
  return feature.properties.CATEGORY;
}

function getTimeLimit(feature) {
  return TIME_LIMITS[getZoneCategory(feature)];
}

function hasPermitForRegion(popList,region) {
  return popList.includes(region.properties.KOD_MC);
}

/*
DONTKNOW
  * position unknown or accuracy low
  * no cleaning data, and outside of SUPPORTED_REGIONS
NO
  * cleaning today
YESBUT
  * cleaning within CLEANING_DAYS
  * anyone in VIS or non-abonent non-resident in MIX or RES (return price and time limit)
YES
  * no cleaning AND ((abonent or resident in RES or MIX) OR (zone not in effect OR zone price = 0))
*/

// Trilean logic conjunction (Lukasiewicz logic)
function triAnd(a, b) {
  if(NO === a || NO === b) return NO;
  if(MAYBE === a || MAYBE === b) return MAYBE;
  return YES;
}

// RULES

function supportedRegionsRule(ctx) {
  if(!isRegionSupported(ctx.currentRegion)) {
    return {
      can: MAYBE,
      because: {
        reason: "unsupportedRegion",
        currentRegion: ctx.currentRegion.properties.NAZEV_MC
      }
    };
  }
  return {can: YES};
}

function accuracyRule(ctx) {
  if(ctx.acc > ACC_THRESH) {
    return {can: MAYBE, because: {reason: "lowAccuracy"}};
  } 
  return {can: YES};
}

function cleaningTodayRule(ctx) {
  if(isCleaningDay(ctx.currentCleaningZone)) {
    return {
      can: NO,
      because: {
        reason: "cleaningToday"
      }
    };
  }
  return {can: YES};
}

function cleaningSoonRule(ctx) {
  const cleaningSoon = isCleaningDaySoon(ctx.currentCleaningZone);
  if(cleaningSoon) {
    return {
      can: YES,
      but: {
        "cleaningSoon": cleaningSoon
      }
    };
  }
  return {can: YES};
}

function limitedParkingRule(ctx) {
  const price = getPrice(ctx.currentParkingZone);
  if (ctx.currentZoneCategory == "VIS" ||
    (["RES", "MIX"].includes(ctx.currentZoneCategory) &&
      !hasPermitForRegion(ctx.pop,ctx.currentRegion) &&
      price > 0)) {
    return {
      can: YES,
      but: {
        timeLimit: getTimeLimit(ctx.currentParkingZone),
        price: price
      }
    };
  }
  return {can: YES};
}

function canPark(lat, lon, acc, pop) {
  // init
  const pnt = turf.point([lon, lat]);
  const currentRegion = getCurrentRegion(pnt);
  const currentCleaningZone = getCleaningZone(pnt);
  const currentParkingZone = getParkingZone(pnt);
  const currentZoneCategory = getZoneCategory(currentParkingZone);
  
  const context = {
    pnt: pnt,
    acc: acc,
    pop: pop,
    currentRegion: currentRegion,
    currentParkingZone: currentParkingZone,
    currentCleaningZone: currentCleaningZone,
    currentZoneCategory: currentZoneCategory
  };
  
  console.log(context);
  
  const rules = [
    supportedRegionsRule,
    accuracyRule,
    cleaningTodayRule,
    cleaningSoonRule,
    limitedParkingRule
  ];
  
  const result = rules.reduce(function(a,v) {
    const vc = v(context);
    a.can = triAnd(a.can, vc.can);
    Object.assign(a.because, vc.because);
    Object.assign(a.but, vc.but);
    return a;
  }, {can: YES, because: {}, but: {}});
  
  return result;
}

// run server
const port = process.env.PORT || 8080;
const app = express();
app.use(bodyParser.json());

app.post('/canpark', function (req, res) {
  result = canPark(req.body.lat, req.body.lon, req.body.acc);
  res.send(result);
});

app.listen(port, function () {
  console.log('Listening');
});

console.log(canPark(50.099293, 14.397815, 20, []));
// tst = turf.point([14.397815, 50.099293]);