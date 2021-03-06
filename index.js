const th = require("@turf/helpers");
const inside = require("@turf/inside");
const circle = require("@turf/circle");
const bbox = require("@turf/bbox");
const intersect = require("@turf/intersect");
const area = require("@turf/area");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const joda = require('js-joda').use(require('js-joda-timezone'));
const overlap = require('turf-overlaps');

// trilean logic
const MAYBE = "MAYBE";
const NO = "NO";
const YES = "YES";

// language parsing
const DOW_CZ = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const FREE_CZ = 'zdarma';

// configuration
const LOCATION_RADIUS = 20 / 1000;// kilometers
const ACC_THRESH = 40;// meters
const CLEANING_DAYS = 20;// days
// const SUPPORTED_REGIONS = ["Praha 3", "Praha 5", "Praha 6", "Praha 8"];
const TZ = joda.ZoneId.of('Europe/Prague');
const TIME_LIMITS = {
  "RES": 3,
  "MIX": 24,
  "VIS": 3
};

// load data
// const cleaningSummer = JSON.parse(fs.readFileSync("data/DOP_TSK_LU_terminy_p.json", {encoding: "utf-8"}));
// const zones = JSON.parse(fs.readFileSync("data/DOP_ZPS_ZonyStani_p.json", {encoding: "utf-8"}));
const cityRegions = JSON.parse(fs.readFileSync("data/TMMESTSKECASTI_P.json", {encoding: "utf-8"}));

/*
THIS IS A HORRIBLE HACK UNTIL I USE AN ACTUAL SPATIAL DB

2D grid index of the city bbox
*/
const GRID = 10;
const regions_bbox = bbox(cityRegions);
const gridX = regions_bbox[0];
const gridY = regions_bbox[1];
const gridW = regions_bbox[2]-regions_bbox[0];
const gridH = regions_bbox[3]-regions_bbox[1];
const gridStepX = gridW / GRID;
const gridStepY = gridH / GRID;

var cleaning_index = JSON.parse(fs.readFileSync("data/cleaning_index", {encoding: "utf-8"}));
var zones_index = JSON.parse(fs.readFileSync("data/zones_index", {encoding: "utf-8"}));
// 2d array, each leaf holds features it overlaps
// var cleaning_index = Array(GRID);
// var zones_index = Array(GRID);

// function makeIndex(idx, polygons) {
//   for(x=0; x<GRID; x++) {
//     idx[x] = Array(GRID);
//     for(y=0; y<GRID; y++) {
//       let sq = th.polygon([[
//         [gridX + x * gridStepX, gridY + y * gridStepY],
//         [gridX + x * gridStepX + gridStepX, gridY + y * gridStepY],
//         [gridX + x * gridStepX + gridStepX, gridY + y * gridStepY + gridStepY],
//         [gridX + x * gridStepX, gridY + y * gridStepY + gridStepY],
//         [gridX + x * gridStepX, gridY + y * gridStepY]
//       ]]);
//       let matching = polygons.filter((p) => isDefined(intersect(p, sq)));
//       idx[x][y] = matching;
//     }
//   }
// }
// a = Date.now();
// makeIndex(cleaning_index, cleaningSummer.features);
// makeIndex(zones_index, zones.features);
// console.log("Made indices");
// console.log(Date.now()-a);

function findFeatureIndexed(point, idx) {
  const x = Math.floor((point.geometry.coordinates[0] - gridX) / gridStepX);
  const y = Math.floor((point.geometry.coordinates[1] - gridY) / gridStepY);
  if(x < 0 || x >= GRID || y < 0 || y >= GRID) return undefined;
  return findFeatureCircleIntersect(point, idx[x][y]);
}
/*
END OF HORRIBLE HACK
*/

// find polygons in an array that overlap the current point
function findFeaturePoint(point, polygons) {
  return polygons.find((e) => inside(point, e));
}

function findFeatureCircleIntersect(point, polygons) {
  const c = circle(point, LOCATION_RADIUS);
  const overlapping = polygons.filter((p)=> overlap(c,p));
  if(overlapping.length > 0) {
    return overlapping.reduce((acc, val) => {
      const a = area(intersect(val,c));
      return a > acc.area ? {poly: val, area: a} : acc;
    }, {poly: {}, area: Number.NEGATIVE_INFINITY}).poly;
    
  } else return undefined;
}

function getCurrentRegion(pnt) {
  return findFeaturePoint(pnt, cityRegions.features);
}

function getCurrentRegionName(feature) {
  return feature.properties.NAZEV_MC;
}

function getCleaningZone(pnt) {
  return findFeatureIndexed(pnt, cleaning_index);
}

function getParkingZone(pnt) {
  return findFeatureIndexed(pnt, zones_index);
}

// "DAY": "10.04.2017, 15.09.2017",
// returns [[10,4,2017],[15,9,2017]]
function parseCleaningDays(feature) {
  return feature.properties.DAY.split(",").map((e) => e.trim().split(".").map((x) => Number(x)));
}

function isCleaningDay(feature, time) {
  const days = parseCleaningDays(feature);
  return days.map((d) =>
    time.dayOfMonth() === d[0] && 
    time.monthValue() === d[1] && 
    time.year() === d[2]
  ).reduce((a,v) => a || v, false);
}

function isCleaningDaySoon(feature, time) {
  const days = parseCleaningDays(feature);
  const upcoming = days.find((d)=> {
    const nd = joda.Period.between(time.toLocalDate(), joda.ZonedDateTime.of8(d[2],d[1],d[0],0,0,0,0,TZ).toLocalDate()).days();
    return nd > 0 && nd < CLEANING_DAYS;
  });
  return (typeof upcoming === "undefined") ? false : joda.Period.between(time.toLocalDate(), joda.ZonedDateTime.of8(upcoming[2], upcoming[1], upcoming[0],0,0,0,0,TZ).toLocalDate()).days();
}

// function isRegionSupported(region) {
//   return SUPPORTED_REGIONS.includes(region.properties.NAZEV_1);
// }

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

function getPrice(feature,time) {
  const tariff = parseTariffText(feature);
  const d = time.dayOfWeek().ordinal();
  const h = time.hour();
  const m = time.minute();
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

function isDefined(a) {
  return typeof a !== 'undefined';
}

// RULES

function supportedRegionsRule(ctx) {
  if(!isDefined(ctx.currentRegion)) { // || !isRegionSupported(ctx.currentRegion)
    return {
      can: MAYBE,
      because: "unsupportedRegion"
    };
  }
  return {can: YES};
}

function accuracyRule(ctx) {
  if(ctx.acc > ACC_THRESH) {
    return {
      can: MAYBE, 
      because: "lowAccuracy"
    };
  } 
  return {can: YES};
}

function noParkingDataRule(ctx) {
  if(!isDefined(ctx.currentParkingZone)) {
    return {
      can: MAYBE,
      because: "noParkingData"
    };
  }
  return {can: YES};
}

function noCleaningDataRule(ctx) {
  if(!isDefined(ctx.currentCleaningZone)) {
    return {
      can: MAYBE,
      because: "noCleaningData"
    };
  }
  return {can: YES};
}

function cleaningTodayRule(ctx) {
  if(isDefined(ctx.currentCleaningZone) && isCleaningDay(ctx.currentCleaningZone, ctx.dt)) {
    return {
      can: NO,
      because: "cleaningToday"
    };
  }
  return {can: YES};
}

function cleaningSoonRule(ctx) {
  if(isDefined(ctx.currentCleaningZone)) {
    const cleaningSoon = isCleaningDaySoon(ctx.currentCleaningZone, ctx.dt);
    if(cleaningSoon) {
      return {
        can: YES,
        but: {
          cleaningSoon: cleaningSoon
        }
      };
    }
  }
  return {can: YES};
}

function limitedParkingRule(ctx) {
  if(isDefined(ctx.currentParkingZone) && isDefined(ctx.currentRegion)) {
    const price = getPrice(ctx.currentParkingZone, ctx.dt);
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
  }
  return {can: YES};
}

function canPark(lat, lon, acc, pop, dt) {
  // init
  const pnt = th.point([lon, lat]);
  const currentRegion = getCurrentRegion(pnt);
  const currentCleaningZone = getCleaningZone(pnt);
  const currentParkingZone = getParkingZone(pnt);
  const currentZoneCategory = typeof currentParkingZone !== 'undefined'? getZoneCategory(currentParkingZone) : "";
  
  const context = {
    dt: dt,
    pnt: pnt,
    acc: acc,
    pop: pop,
    currentRegion: currentRegion,
    currentParkingZone: currentParkingZone,
    currentCleaningZone: currentCleaningZone,
    currentZoneCategory: currentZoneCategory
  };
  
  const rules = [
    accuracyRule,
    supportedRegionsRule,
    noCleaningDataRule,
    noParkingDataRule,
    cleaningTodayRule,
    cleaningSoonRule,
    limitedParkingRule
  ];
  
  const result = rules.reduce(function(a,v) {
    const vc = v(context);
    a.can = triAnd(a.can, vc.can);
    if(isDefined(vc.because)) a.because.push(vc.because);
    Object.assign(a.but, vc.but);
    return a;
  }, {can: YES, because: [], but: {}});
  
  return result;
}

// run server
const port = process.env.PORT || 8080;
const app = express();
app.use(bodyParser.json());

if(process.env.NODE_ENV !== "dev") {
  app.use(function(req, res, next) {
      var reqType = req.headers["x-forwarded-proto"];
      reqType == 'https' ? next() : res.redirect("https://" + req.headers.host + req.url);
  });
}

app.use('/', express.static('public'));

app.post('/canpark', function (req, res) {
  a = Date.now();
  result = canPark(req.body.lat, req.body.lon, req.body.acc, req.body.pop, joda.ZonedDateTime.now(TZ));
  console.log(Date.now()-a);
  res.send(result);
});

app.listen(port, function () {
  console.log('Listening');
});
