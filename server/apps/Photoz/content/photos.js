// Photoz - View and autozoom photo collections
// (c) 2013-2014 - Michel Beaudouin-Lafon - mbl@lri.fr

var photos = module.exports = {};
photos.dir ="photos";
photos.fullFrameDir = "fullSize";
photos.halfFrameDir = "halfSize";
photos.quarterFrameDir = "quarterSize";
photos.thumbsDir = "thumbs";
photos.source = "Sam Droege USGS Bee Inventory and Monitoring Lab - https://www.flickr.com/photos/usgsbiml/";
photos.all = [
{
  file: "Celebrity Insects/Anthophora-bomboides,-unkown,-face_2012-06-12-144636-ZS-PMax_7366624642_o.jpg",
  pixelHeight: 2808,
  pixelWidth: 4212,
  description: "Anthophora bomboides, male, May 2012, Allegany County, Maryland....Friends at the National Wildlife Federation have suggested this be called the Kenny Rogers Bee...for obvious reasons."
},
{
  file: "Celebrity Insects/Augochlora regina, U, face, Dominican Republic_2012-09-27-110326 ZS PMax_8036768157_o.jpg",
  pixelHeight: 2760,
  pixelWidth: 3228,
  description: "Augochlora regina, Dominican Republic, formerly A. elegans. Also have been dubbed the Blue Man bee."
},
{
  file: "Celebrity Insects/Melecta species, face, Park County, Wyoming, M_2013-01-22-143402 ZS PMax_8423768865_o.jpg",
  pixelHeight: 2919,
  pixelWidth: 3965,
  description: "Fossil Butte National Monument, Wyoming Note that friends at National Wildlife Federation have dubbed this species the Billy Idol Bee. Since it has no common name I hear-by declare this species' common name to be the Billy Idol Melecta Note, however, that all the bees in the genus Melecta are nest parasites."
},
{
  file: "Celebrity Insects/Pepsis ruficornis, U, face, Dominican Republic_2012-11-29-143147 ZS PMax_8236869032_o.jpg",
  pixelHeight: 1784,
  pixelWidth: 2146,
  description: "Pompilid Spider Wasp, Central Highlands High Elevation Domincan Republic Pepsis ruficornis. Someone has suggested that this one be called the Woolly Mammoth Spider Wasp."
},
{
  file: "Celebrity Insects/Ripiphorus species, U, face, Tennessee, Blount County_2013-02-07-144331 ZS PMax_8457761700_o.jpg",
  pixelHeight: 2388,
  pixelWidth: 3024,
  description: "Great Smoky Mountains National Park Doug Yanega has identified this as one of the wedge-shaped beetles in the Genus Ripiphorus. Several people have suggested that this be given the common name the Andy Rooney Beetle."
},
{
  file: "Celebrity Insects/Scarabaeidae, U, face, west virginia_2013-01-31-141109 ZS PMax_8466515156_o.jpg",
  pixelHeight: 3122,
  pixelWidth: 3451,
  description: "Unknown Scarab, found in bowl trap in the high plateau of West Virginia by Jane Whitaker, specimen approximately 8mm and floating in hand sanitzer. You can see a couple of mites on the left side. This specimen has been designated as the Gilbert Godfrey Beetle by the NWF Staff."
},
{
  file: "Celebrity Insects/Tosale oviplagalis, face_2012-06-01-115725-ZS-PMax_7159690897_o.jpg",
  pixelHeight: 2457,
  pixelWidth: 3776,
  description: "Upper Marlboro, MD, May 2012 This species has a common name: Dimorphic Tosale Moth but it also has been named by the Doug Inkley The George Washington Moth."
},
{
  file: "Celebrity Insects/Velarifictorus micado,-face_2012-07-09-183011-ZS-PMax_7546292736_o.jpg",
  pixelHeight: 3009,
  pixelWidth: 3341,
  description: "Japanase Burrowing Cricket, Velarifictorus micado, Beltsville, Maryland, July 2012, A reporter from Wired Magazine commented that this specimen was remarkably similar to Rodin's &quot;The Thinker&quot;."
},
{
  file: "Celebrity Insects/Velarifictorus micado,-side_2012-07-09-183602-ZS-PMax_7546290276_o.jpg",
  pixelHeight: 3557,
  pixelWidth: 5335,
  description: "Japanese Burrowing Cricket, Beltsville, MD, July 2012, A reporter from Wired Magazine commented that this specimen was remarkably similar to Rodin's &quot;The Thinker&quot;."
},
{
  file: "Puerto Rican Bees/Anthophora tricolor, M, Back, Puerto Rico_2013-07-03-141837 ZS PMax_9438182965_o.jpg",
  pixelHeight: 3396,
  pixelWidth: 4320,
  description: "A lovely bee from Puerto Rico collected by Sara Prado."
},
{
  file: "Puerto Rican Bees/Anthophora tricolor, M, Face, Puerto Rico_2013-07-03-142724 ZS PMax_9438182287_o.jpg",
  pixelHeight: 3360,
  pixelWidth: 4784,
  description: "A lovely bee from Puerto Rico collected by Sara Prado."
},
{
  file: "Puerto Rican Bees/Anthophora tricolor, M, Side, Puerto Rico_2013-07-03-144014 ZS PMax_9440965552_o.jpg",
  pixelHeight: 3408,
  pixelWidth: 4020,
  description: "A lovely bee from Puerto Rico collected by Sara Prado."
},
{
  file: "Puerto Rican Bees/Centris decolorata, M, Face, Puerto Rico_2013-06-27-150244 ZS PMax_9184110232_o.jpg",
  pixelHeight: 2976,
  pixelWidth: 4500,
  description: ""
},
{
  file: "Puerto Rican Bees/Centris decolorata, M, Side, Puerto Rico_2013-06-27-151219 ZS PMax_9184108502_o.jpg",
  pixelHeight: 3744,
  pixelWidth: 4788,
  description: ""
},
{
  file: "Puerto Rican Bees/Centris haemorrhoidalis, F, Back, Puerto Rico_2013-06-27-151839 ZS PMax_9162545362_o.jpg",
  pixelHeight: 3624,
  pixelWidth: 3204,
  description: "A lovely Centris from Puerto Rico, collected by Sara Prado."
},
{
  file: "Puerto Rican Bees/Centris haemorrhoidalis, F, Face, Puerto Rico_2013-06-27-152444 ZS PMax_9160321029_o.jpg",
  pixelHeight: 3120,
  pixelWidth: 3920,
  description: "A lovely Centris from Puerto Rico, collected by Sara Prado."
},
{
  file: "Puerto Rican Bees/Centris haemorrhoidalis, F, Side, Puerto Rico_2013-06-27-153217 ZS PMax_9162541994_o.jpg",
  pixelHeight: 3228,
  pixelWidth: 4032,
  description: "A lovely Centris from Puerto Rico, collected by Sara Prado."
},
{
  file: "Puerto Rican Bees/Centris lanipes, F, Back, Puerto Rico_2013-07-05-160141 ZS PMax_9259664010_o.jpg",
  pixelHeight: 3468,
  pixelWidth: 3072,
  description: "A small Centris species taken by Sara Prado in Puerto Rico."
},
{
  file: "Puerto Rican Bees/Centris lanipes, F, Face, Puerto Rico_2013-07-05-160722 ZS PMax_9256887511_o.jpg",
  pixelHeight: 3124,
  pixelWidth: 2960,
  description: "A small Centris species taken by Sara Prado in Puerto Rico."
},
{
  file: "Puerto Rican Bees/Centris lanipes, F, Side, Puerto Rico_2013-07-05-161301 ZS PMax_9256886727_o.jpg",
  pixelHeight: 3264,
  pixelWidth: 4104,
  description: "A small Centris species taken by Sara Prado in Puerto Rico."
},
{
  file: "Puerto Rican Bees/Centris lanipes, U, Back, Puerto Rico_2013-06-27-154344 ZS PMax-Recovered_9181894865_o.jpg",
  pixelHeight: 3528,
  pixelWidth: 3984,
  description: "A small Centris species take by Sara Prado in Puerto Rico."
},
{
  file: "Puerto Rican Bees/Centris lanipes, U, Face, Puerto Rico_2013-06-27-155531 ZS PMax-Recovered_9184104412_o.jpg",
  pixelHeight: 2988,
  pixelWidth: 4656,
  description: "A small Centris species take by Sara Prado in Puerto Rico."
},
{
  file: "Puerto Rican Bees/Centris lanipes, U, Side, Puerto Rico_2013-06-27-160533 ZS PMax_9181899481_o.jpg",
  pixelHeight: 3468,
  pixelWidth: 3864,
  description: "A small Centris species take by Sara Prado in Puerto Rico."
},
{
  file: "Puerto Rican Bees/Lasioglossum parvum, F, Back, Puerto Rico_2013-07-05-162119 ZS PMax_9400334479_o.jpg",
  pixelHeight: 3612,
  pixelWidth: 2736,
  description: "Lasioglossum parvum...collected in Puerto Rico agricultural areas by Sara Prado."
},
{
  file: "Puerto Rican Bees/Lasioglossum parvum, F, Face, Puerto Rico_2013-07-05-162719 ZS PMax_9403096094_o.jpg",
  pixelHeight: 2364,
  pixelWidth: 2184,
  description: "Lasioglossum parvum...collected in Puerto Rico agricultural areas by Sara Prado."
},
{
  file: "Puerto Rican Bees/Lasioglossum parvum, F, Side, Puerto Rico_2013-07-05-163409 ZS PMax_9400336241_o.jpg",
  pixelHeight: 2376,
  pixelWidth: 4272,
  description: "Lasioglossum parvum...collected in Puerto Rico agricultural areas by Sara Prado."
},
{
  file: "Puerto Rican Bees/Melissodes trifasciata, F, Back, Puerto Rico_2013-07-03-153143 ZS PMax_9216199186_o.jpg",
  pixelHeight: 3744,
  pixelWidth: 4440,
  description: ""
},
{
  file: "Puerto Rican Bees/Melissodes trifasciata, F, Face, Puerto Rico_2013-07-03-153724 ZS PMax_9216198060_o.jpg",
  pixelHeight: 3744,
  pixelWidth: 2724,
  description: ""
},
{
  file: "Puerto Rican Bees/Melissodes trifasciata, F, Side, Puerto Rico_2013-07-03-154807 ZS PMax_9216196922_o.jpg",
  pixelHeight: 3276,
  pixelWidth: 4332,
  description: ""
},
{
  file: "Puerto Rican Bees/Sphecodes sp, F, Back 1, Puerto Rico, St Isabel_2013-07-11-170609 ZS_9311726183_o.jpg",
  pixelHeight: 3604,
  pixelWidth: 4212,
  description: "A species of Sphecodes captured in agriculture areas of Puerto Rico by Sara Prado. This is either a new island record or a new species as there are no known records for Sphecodes for the island. Notice the lovely WIPs (Wing Interference Patterns)."
},
{
  file: "Puerto Rican Bees/Sphecodes sp, F, Back, Puerto Rico, St Isabel_2013-07-11-171259 ZS PMax_9311719151_o.jpg",
  pixelHeight: 3540,
  pixelWidth: 4800,
  description: "A species of Sphecodes captured in agriculture areas of Puerto Rico by Sara Prado. This is either a new island record or a new species as there are no known records for Sphecodes for the island.Notice the lovely WIPs (Wing Interference Patterns)."
},
{
  file: "Puerto Rican Bees/Sphecodes sp, F, Face, Puerto Rico, St Isabel_2013-07-11-171757 ZS PMax_9311721437_o.jpg",
  pixelHeight: 2220,
  pixelWidth: 2364,
  description: "A species of Sphecodes captured in agriculture areas of Puerto Rico by Sara Prado. This is either a new island record or a new species as there are no known records for Sphecodes for the island.Notice the lovely WIPs (Wing Interference Patterns)."
},
{
  file: "Puerto Rican Bees/Sphecodes sp, F, Side, Puerto Rico, St Isabel_2013-07-11-172830 ZS PMax_9311713419_o.jpg",
  pixelHeight: 3120,
  pixelWidth: 4672,
  description: "A species of Sphecodes captured in agriculture areas of Puerto Rico by Sara Prado. This is either a new island record or a new species as there are no known records for Sphecodes for the island. Notice the lovely WIPs (Wing Interference Patterns)."
}
];
