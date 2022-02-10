SELECT appenv, isp2p,
	COUNT(sentpacketslostpct) AS samples,
    AVG(sentpacketslostpct) AS sentpacketslostpct,
    AVG(receivedpacketslostpct) AS receivedpacketslostpct,
    AVG(meanrtt) AS meanrtt
FROM "rtcstats"."public"."rtcstats_pc_metrics"
INNER JOIN rtcstats ON rtcstats.statssessionid = rtcstats_pc_metrics.statssessionid
WHERE sessionduration >= 10000
GROUP BY isp2p, appenv
