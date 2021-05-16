/* eslint-disable max-len */
import cron from 'node-cron';
import {
  calendarByDistrict,
} from 'cowin-api-client';
import moment from 'moment';
import sendMessage from '../utils/slackMessage';
import generateTimeString, { GenerateCronTimeStringInterface } from '../utils/cronScheduleGenerator';
import redis from '../db/redis';

const time: GenerateCronTimeStringInterface = {
  minute: 1,
};

// eslint-disable-next-line no-unused-vars
const addresses = [
  {
    state: 'Karnataka',
    state_id: 16,
    district: 'Dakshina Kannada',
    district_id: 269,
    pinCode: 574154,
  },
];

const init = async () => {
  let oldCentersList = await redis.getAsync('availableCenters');
  oldCentersList = JSON.parse(oldCentersList || '[]');

  const appointmentRequests = await calendarByDistrict(269, moment().format('DD-MM-YYYY'));

  const availableAppointments: { date: string; name: string; district: string; pincode: number; ageLimit: number; vaccine: string; }[] = [];
  appointmentRequests.centers.forEach((center) => {
    center.sessions.forEach((session) => {
      if (session.available_capacity > 0) {
        availableAppointments.push({
          date: session.date,
          name: center.name,
          district: center.district_name,
          pincode: center.pincode,
          ageLimit: session.min_age_limit,
          vaccine: session.vaccine,
        });
      }
    });
  });

  const centers: { [key: string]: any[] } = {};
  availableAppointments.forEach((apt) => {
    const { name, ...rest } = apt;

    if (!centers[name]) {
      centers[name] = [];
    }

    centers[name].push(rest);
  });

  let centerAvailable = false;
  Object.keys(centers).forEach((name) => {
    if (!oldCentersList?.includes(name)) {
      centerAvailable = true;

      // fire slack call
      sendMessage({
        channel: '#vaccine-checker',
        text: `vaccine available at ${name}`,
      });
    }
  });

  const centerList = Object.keys(centers).sort();
  if (!centerAvailable) {
    console.log(`No Vaccine found @ ${moment().format()}`);
    console.log(`${centerList.length} centers checked`);
  }

  redis.setAsync('availableCenters', JSON.stringify(centerList));
};

const main = () => {
  const str = generateTimeString(time);

  const task = cron.schedule(str, async () => {
    init();
  });

  return task;
};

export default main;
