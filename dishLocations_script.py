import requests
import json

url = "https://gitlab.com/ska-telescope/ost/ska-ost-array-config/-/raw/master/src/ska_ost_array_config/static/mid_array_coords.dat"

response = requests.get(url)
lines = response.text.splitlines()

stations = []

MKAT = ["M000", "M001", "M002", "M003", "M004", "M005", "M006", "M007", "M008", "M009", "M010", "M011", "M012", "M013", "M014", "M015", "M016", "M017", "M018", "M019", "M020", "M021", "M022", "M023", "M024", "M025", "M026", "M027", "M028", "M029", "M030", "M031", "M032", "M033", "M034", "M035", "M036", "M037", "M038", "M039", "M040", "M041", "M042", "M043", "M044", "M045", "M046", "M047", "M048", "M049", "M050", "M051", "M052", "M053", "M054", "M055", "M056", "M057", "M058", "M059", "M060", "M061", "M062", "M063"]
AA0_5 = ["SKA001", "SKA036", "SKA077", "SKA100"]
AA1 = ["SKA036", "SKA040", "SKA045", "SKA046", "SKA048", "SKA077", "SKA081", "SKA101"]
AA2 = ["SKA001" , "SKA013", "SKA014", "SKA015", "SKA016", "SKA019", "SKA022", "SKA024", "SKA025", "SKA026", "SKA027", "SKA028", "SKA029", "SKA030", "SKA031", "SKA032", "SKA033", "SKA034", "SKA035", "SKA036", "SKA037", "SKA038", "SKA039", "SKA040", "SKA041", "SKA042", "SKA043", "SKA045", "SKA046", "SKA048", "SKA049", "SKA050", "SKA055", "SKA061", "SKA063", "SKA067", "SKA068", "SKA070", "SKA075", "SKA077", "SKA079", "SKA081", "SKA082", "SKA083", "SKA089", "SKA091", "SKA092", "SKA095", "SKA096", "SKA098", "SKA099", "SKA100", "SKA101", "SKA102", "SKA103", "SKA104", "SKA106", "SKA108", "SKA109", "SKA111", "SKA113", "SKA114", "SKA123", "SKA125", "SKA126"]
AAstar = ["M000", "M001", "M002", "M003", "M004", "M005", "M006", "M007", "M008", "M009", "M010", "M011", "M012", "M013", "M014", "M015", "M016", "M017", "M018", "M019", "M020", "M021", "M022", "M023", "M024", "M025", "M026", "M027", "M028", "M029", "M030", "M031", "M032", "M033", "M034", "M035", "M036", "M037", "M038", "M039", "M040", "M041", "M042", "M043", "M044", "M045", "M046", "M047", "M048", "M049", "M050", "M051", "M052", "M053", "M054", "M055", "M056", "M057", "M058", "M059", "M060", "M061", "M062", "M063", "SKA001", "SKA013", "SKA014", "SKA015", "SKA016", "SKA017", "SKA018", "SKA019", "SKA020", "SKA022", "SKA023", "SKA024", "SKA025", "SKA026", "SKA027", "SKA028", "SKA029", "SKA030", "SKA031", "SKA032", "SKA033", "SKA034", "SKA035", "SKA036", "SKA037", "SKA038", "SKA039", "SKA040", "SKA041", "SKA042", "SKA043", "SKA045", "SKA046", "SKA048", "SKA049", "SKA050", "SKA055", "SKA060", "SKA061", "SKA063", "SKA067", "SKA068", "SKA070", "SKA075", "SKA077", "SKA079", "SKA081", "SKA082", "SKA083", "SKA089", "SKA091", "SKA092", "SKA095", "SKA096", "SKA098", "SKA099", "SKA100", "SKA101", "SKA102", "SKA103", "SKA104", "SKA105", "SKA106", "SKA107", "SKA108", "SKA109", "SKA110", "SKA111", "SKA113", "SKA114", "SKA115", "SKA116", "SKA117", "SKA118", "SKA119", "SKA121", "SKA123", "SKA125", "SKA126"]

for i, line in enumerate(lines):
    # Skip comments or empty lines
    if line.startswith("#") or not line.strip():
        continue

    parts = line.split(",")

    # Adjust indices if file structure differs
    name = parts[0]
    lat = parts[1]
    lon = parts[2]
    elev = parts[3]
    ecef_x = parts[4]
    ecef_y = parts[5]
    ecef_z = parts[6]

    if name.startswith("M"):
        stage = "MKAT"
    elif name in AA0_5:
        stage = "AA0.5"
    elif name in AA1:
        stage = "AA1"
    elif name in AA2:
        stage = "AA2"
    elif name in AAstar:
        stage = "AA*"
    else:
        stage = "AA4"

    station = {
        "Dish ID": name,
        "Label": name,
        "Latitude": lon,
        "Longitude": lat,
        "Elevation": elev,
        "ECEF-X": ecef_x,
        "ECEF-Y": ecef_y,
        "ECEF-Z": ecef_z,
        "Project Stage": stage,
    }

    stations.append(station)

# Save to file
with open("dishLocations.json", "w") as f:
    json.dump(stations, f, indent=4)

print("Done. File saved as dishLocations.json")